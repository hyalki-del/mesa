class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  setPeaking(freq, q, gainDb, sampleRate) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);

    const b0 = 1 + alpha * A;
    const b1 = -2 * cosw0;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha / A;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setShelf(type, freq, gainDb, sampleRate) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const S = 1;
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

    let b0, b1, b2, a0, a1, a2;
    if (type === "low") {
      b0 = A * ((A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
      b2 = A * ((A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha);
      a0 = (A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosw0);
      a2 = (A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      b2 = A * ((A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha);
      a0 = (A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      a2 = (A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

function triodeStage(x, drive, asym = 0.14) {
  const u = x * drive + asym * x * x;
  return Math.tanh(u) - 0.12 * Math.tanh(2.4 * u);
}

class MarkIVWorklet extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const knob = (name, def) => ({
      name, defaultValue: def, minValue: 0, maxValue: 10, automationRate: "k-rate"
    });
    const eqBand = (name) => ({
      name, defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate"
    });
    const sw = (name, def) => ({
      name, defaultValue: def, minValue: 0, maxValue: 1, automationRate: "k-rate"
    });

    return [
      knob("inputGainRhy", 5),
      knob("rhy1Gain", 5),
      knob("lead2Gain", 5),
      knob("lead3Gain", 6),
      { name: "channel", defaultValue: 0, minValue: 0, maxValue: 2, automationRate: "k-rate" },
      knob("r1L2Treble", 5),
      knob("l3Treble", 5.5),
      knob("r1L2Bass", 5),
      knob("l3Bass", 4.5),
      knob("r1L2Mid", 5),
      knob("l3Mid", 5),
      knob("r1L2Pres", 5),
      knob("l3Pres", 5),
      knob("rhy1Master", 6),
      knob("lead2Master", 6),
      knob("lead3Master", 6),
      knob("presence", 5),
      knob("reverb", 2),
      knob("dynamics", 5),
      eqBand("eq80"),
      eqBand("eq240"),
      eqBand("eq750"),
      eqBand("eq2200"),
      eqBand("eq6600"),
      sw("eqOn", 1),
      sw("soloOn", 0),
      sw("standbyOn", 1),
      sw("powerOn", 1),
      knob("outputLevel", 6)
    ];
  }

  constructor() {
    super();
    this.bassFilter = new Biquad();
    this.midFilter = new Biquad();
    this.trebleFilter = new Biquad();
    this.presenceFilter = new Biquad();
    this.eqBands = [new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    this.eqFreqs = [80, 240, 750, 2200, 6600];

    const sr = sampleRate;
    this.revDelays = [
      new Float32Array(Math.floor(0.029 * sr)),
      new Float32Array(Math.floor(0.037 * sr)),
      new Float32Array(Math.floor(0.043 * sr)),
      new Float32Array(Math.floor(0.053 * sr))
    ];
    this.revIdx = [0, 0, 0, 0];
    this.env = 0;
  }

  updateFilters(params) {
    const ch = Math.round(params.channel[0]);
    const isL3 = ch === 2;

    const bassVal = isL3 ? params.l3Bass[0] : params.r1L2Bass[0];
    const midVal = isL3 ? params.l3Mid[0] : params.r1L2Mid[0];
    const trebVal = isL3 ? params.l3Treble[0] : params.r1L2Treble[0];
    const presVal = ((isL3 ? params.l3Pres[0] : params.r1L2Pres[0]) + params.presence[0]) * 0.5;

    this.bassFilter.setShelf("low", 110, (bassVal - 5) * 1.6, sampleRate);
    this.midFilter.setPeaking(620, 1.1, (midVal - 5) * 1.8, sampleRate);
    this.trebleFilter.setShelf("high", 2400, (trebVal - 5) * 1.7, sampleRate);
    this.presenceFilter.setShelf("high", 4200, (presVal - 5) * 1.6, sampleRate);

    const eqVals = [
      params.eq80[0],
      params.eq240[0],
      params.eq750[0],
      params.eq2200[0],
      params.eq6600[0]
    ];
    for (let i = 0; i < 5; i++) {
      this.eqBands[i].setPeaking(this.eqFreqs[i], 1.4, eqVals[i], sampleRate);
    }
  }

  processReverb(x, revAmount) {
    if (revAmount <= 0.001) return 0;
    let sum = 0;
    for (let i = 0; i < this.revDelays.length; i++) {
      const buf = this.revDelays[i];
      const idx = this.revIdx[i];
      const delayed = buf[idx];
      buf[idx] = x * 0.35 + delayed * 0.52;
      this.revIdx[i] = (idx + 1) % buf.length;
      sum += delayed;
    }
    return (sum * 0.25) * (revAmount / 10) * 0.5;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    const powerOn = parameters.powerOn[0] >= 0.5;
    const standbyOn = parameters.standbyOn[0] >= 0.5;
    if (!input || !powerOn || !standbyOn) {
      output.fill(0);
      return true;
    }

    this.updateFilters(parameters);

    const ch = Math.round(parameters.channel[0]);
    const inRhy = parameters.inputGainRhy[0] / 5;
    const r1G = 0.8 + (parameters.rhy1Gain[0] / 10) * 3.5;
    const l2G = 1.4 + (parameters.lead2Gain[0] / 10) * 6.5;
    const l3G = 2.0 + (parameters.lead3Gain[0] / 10) * 9.0;

    const master =
      ch === 0
        ? parameters.rhy1Master[0] / 10
        : ch === 1
        ? parameters.lead2Master[0] / 10
        : parameters.lead3Master[0] / 10;

    const dynAmount = parameters.dynamics[0] / 10;
    const revAmount = parameters.reverb[0];
    const eqOn = parameters.eqOn[0] >= 0.5;
    const soloBoost = parameters.soloOn[0] >= 0.5 ? Math.pow(10, 4.5 / 20) : 1.0;
    const outLevel = Math.pow(parameters.outputLevel[0] / 10, 1.4);

    for (let i = 0; i < output.length; i++) {
      let s = input[i];

      // Dynamics envelope / punch shaping
      const absS = Math.abs(s);
      const coeff = absS > this.env ? 0.005 : 0.0005;
      this.env += coeff * (absS - this.env);
      const dynGain = 1 / (1 + dynAmount * this.env * 2.2);
      s *= dynGain;

      // Channel gain & triode stages
      if (ch === 0) {
        s = triodeStage(s * inRhy * r1G, 1.3, 0.1);
      } else if (ch === 1) {
        s = triodeStage(s * l2G, 1.8, 0.14);
        s = triodeStage(s, 1.4, 0.12);
      } else {
        s = triodeStage(s * l2G * 0.8, 1.7, 0.14);
        s = triodeStage(s * l3G * 0.55, 2.2, 0.16);
      }

      // Tone stack & presence
      s = this.bassFilter.process(s);
      s = this.midFilter.process(s);
      s = this.trebleFilter.process(s);
      s = this.presenceFilter.process(s);

      // 5-band graphic EQ
      if (eqOn) {
        for (let b = 0; b < 5; b++) {
          s = this.eqBands[b].process(s);
        }
      }

      // Reverb & channel master + solo + output level
      const wetRev = this.processReverb(s, revAmount);
      output[i] = (s * master + wetRev) * soloBoost * outLevel;
    }

    return true;
  }
}

registerProcessor("markiv-worklet", MarkIVWorklet);
