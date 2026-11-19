const ANTI_DENORMAL = 1e-24;

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  setPeaking(freq, q, gainDb, sr) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sr;
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

  setShelf(type, freq, gainDb, sr) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sr;
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
    const inp = x + ANTI_DENORMAL;
    const y = this.b0 * inp + this.z1;
    this.z1 = this.b1 * inp - this.a1 * y + this.z2;
    this.z2 = this.b2 * inp - this.a2 * y;
    return y - ANTI_DENORMAL;
  }
}

class DcBlocker {
  constructor(cutoffHz, sr) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sr;
    this.a = rc / (rc + dt);
    this.xPrev = 0;
    this.yPrev = 0;
  }

  process(x) {
    const y = this.a * (this.yPrev + x - this.xPrev) + ANTI_DENORMAL;
    this.xPrev = x;
    this.yPrev = y - ANTI_DENORMAL;
    return y - ANTI_DENORMAL;
  }
}

function triodeStage(x, drive, asym = 0.14) {
  const driven = x * drive;
  const u = driven + asym * driven * driven;
  return Math.tanh(u) - 0.1 * Math.tanh(2.2 * u);
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
      sw("cabOn", 1),
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
    this.dcBlocker = new DcBlocker(18, sampleRate);

    // 4x12 Celestion Vintage 30 cabinet voicing filters
    this.cabFilters = [
      new Biquad(), // 0: Low-end tightness / resonance (~115 Hz)
      new Biquad(), // 1: Low-mid body (~520 Hz)
      new Biquad(), // 2: V30 upper-mid contour (~2.7 kHz)
      new Biquad()  // 3: Speaker top-end roll-off (~5.4 kHz)
    ];
    this.updateCabFilters(sampleRate);

    const sr = sampleRate;
    this.revDelays = [
      new Float32Array(Math.max(1, Math.floor(0.029 * sr))),
      new Float32Array(Math.max(1, Math.floor(0.037 * sr))),
      new Float32Array(Math.max(1, Math.floor(0.043 * sr))),
      new Float32Array(Math.max(1, Math.floor(0.053 * sr)))
    ];
    this.revDamp = [0, 0, 0, 0];
    this.revIdx = [0, 0, 0, 0];
    this.env = 0;
    this.smoothMaster = 0.6;
  }

  updateCabFilters(sr) {
    this.cabFilters[0].setShelf("low", 115, 2.5, sr);
    this.cabFilters[1].setPeaking(520, 1.1, 1.5, sr);
    this.cabFilters[2].setPeaking(2700, 1.3, 2.2, sr);
    this.cabFilters[3].setShelf("high", 5400, -9.0, sr);
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
      const damped = this.revDamp[i] + 0.35 * (delayed - this.revDamp[i]) + ANTI_DENORMAL;
      this.revDamp[i] = damped - ANTI_DENORMAL;
      buf[idx] = x * 0.3 + damped * 0.48;
      this.revIdx[i] = (idx + 1) % buf.length;
      sum += damped;
    }
    return (sum * 0.25) * (revAmount / 10) * 0.45;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    const powerOn = parameters.powerOn[0] >= 0.5;
    const standbyOn = parameters.standbyOn[0] >= 0.5;
    if (!input || !powerOn || !standbyOn) {
      this.env = 0;
      output.fill(0);
      return true;
    }

    this.updateFilters(parameters);

    const ch = Math.round(parameters.channel[0]);
    const inRhy = 0.5 + (parameters.inputGainRhy[0] / 10) * 1.2;
    const r1G = 0.7 + (parameters.rhy1Gain[0] / 10) * 3.2;
    const l2G = 1.3 + (parameters.lead2Gain[0] / 10) * 6.0;
    const l3G = 1.8 + (parameters.lead3Gain[0] / 10) * 8.5;

    const targetMaster =
      ch === 0
        ? parameters.rhy1Master[0] / 10
        : ch === 1
        ? parameters.lead2Master[0] / 10
        : parameters.lead3Master[0] / 10;

    const dynAmount = parameters.dynamics[0] / 10;
    const revAmount = parameters.reverb[0];
    const eqOn = parameters.eqOn[0] >= 0.5;
    const cabOn = parameters.cabOn[0] >= 0.5;
    const soloBoost = parameters.soloOn[0] >= 0.5 ? Math.pow(10, 4.5 / 20) : 1.0;
    const outLevel = Math.pow(parameters.outputLevel[0] / 10, 1.4);
    const masterSmoothCoeff = 1 - Math.exp(-1 / (0.012 * sampleRate));

    for (let i = 0; i < output.length; i++) {
      this.smoothMaster += masterSmoothCoeff * (targetMaster - this.smoothMaster);

      let s = input[i];

      // Dynamics envelope / punch shaping
      const absS = Math.abs(s) + ANTI_DENORMAL;
      const coeff = absS > this.env ? 0.005 : 0.0005;
      this.env += coeff * (absS - this.env);
      const dynGain = 1 / (1 + dynAmount * this.env * 2.2);
      s *= dynGain;

      // Channel gain & triode stages
      if (ch === 0) {
        s = triodeStage(s * inRhy * r1G, 1.25, 0.1);
      } else if (ch === 1) {
        s = triodeStage(s * inRhy * l2G, 1.75, 0.14);
        s = triodeStage(s, 1.35, 0.12);
      } else {
        s = triodeStage(s * inRhy * l2G * 0.8, 1.65, 0.14);
        s = triodeStage(s * l3G * 0.55, 2.1, 0.16);
      }

      s = this.dcBlocker.process(s);

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

      // Reverb & smoothed channel master + solo + optional 4x12 V30 cab + output level
      const wetRev = this.processReverb(s, revAmount);
      let outSample = (s * this.smoothMaster + wetRev) * soloBoost;
      if (cabOn) {
        for (let c = 0; c < this.cabFilters.length; c++) {
          outSample = this.cabFilters[c].process(outSample);
        }
      }
      output[i] = outSample * outLevel;
    }

    return true;
  }
}

registerProcessor("markiv-worklet", MarkIVWorklet);
