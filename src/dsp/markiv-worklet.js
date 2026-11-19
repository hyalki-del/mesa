const ANTI_DENORMAL = 1e-24;

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  setHighPass(freq, q, sr) {
    const w0 = (2 * Math.PI * freq) / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);

    const b0 = (1 + cosw0) * 0.5;
    const b1 = -(1 + cosw0);
    const b2 = (1 + cosw0) * 0.5;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
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

/**
 * Asymmetric 12AX7 triode stage model:
 * y = tanh(k1 * u + k2 * u^2 - bias) + bias
 */
function triodeStage(u, k1, k2 = 0.16, bias = 0.04) {
  const z = k1 * u + k2 * u * u - bias;
  return Math.tanh(z) + bias;
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
    const sr = sampleRate;

    // Inter-stage coupling high-pass & cathode bypass shelves (V1A, V1B, V2A)
    this.v1aCouplingHpf = new Biquad();
    this.v1aCathodeShelf = new Biquad();
    this.v1bCouplingHpf = new Biquad();
    this.v1bCathodeShelf = new Biquad();
    this.v2aCouplingHpf = new Biquad();
    this.v2aCathodeShelf = new Biquad();

    this.v1aCouplingHpf.setHighPass(34, 0.707, sr);
    this.v1bCouplingHpf.setHighPass(48, 0.707, sr);
    this.v2aCouplingHpf.setHighPass(56, 0.707, sr);

    // Tone stack & presence
    this.bassFilter = new Biquad();
    this.midFilter = new Biquad();
    this.trebleFilter = new Biquad();
    this.presenceFilter = new Biquad();

    // 5-band graphic EQ
    this.eqBands = [new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    this.eqFreqs = [80, 240, 750, 2200, 6600];

    // DC blockers after nonlinear stages
    this.dcV1a = new DcBlocker(16, sr);
    this.dcLead = new DcBlocker(18, sr);

    // 4x12 Celestion Vintage 30 cabinet voicing filters
    this.cabFilters = [
      new Biquad(),
      new Biquad(),
      new Biquad(),
      new Biquad()
    ];
    this.updateCabFilters(sr);

    // Damped multi-tap reverb
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
    this.ldrLead = 0; // Smoothed LDR state for lead routing
  }

  updateCabFilters(sr) {
    this.cabFilters[0].setShelf("low", 115, 2.5, sr);
    this.cabFilters[1].setPeaking(520, 1.1, 1.5, sr);
    this.cabFilters[2].setPeaking(2700, 1.3, 2.2, sr);
    this.cabFilters[3].setShelf("high", 5400, -9.0, sr);
  }

  updateFilters(params, ldrLead) {
    const ch = Math.round(params.channel[0]);
    const isL3 = ch === 2;

    const bassVal = isL3 ? params.l3Bass[0] : params.r1L2Bass[0];
    const midVal = isL3 ? params.l3Mid[0] : params.r1L2Mid[0];
    const trebVal = isL3 ? params.l3Treble[0] : params.r1L2Treble[0];
    const presVal = ((isL3 ? params.l3Pres[0] : params.r1L2Pres[0]) + params.presence[0]) * 0.5;

    // Cathode bypass shelf depth shifts with lead engagement & treble
    const v1aShelfDb = 2.0 + (trebVal / 10) * 3.5 + ldrLead * 2.0;
    const v1bShelfDb = 1.5 + ldrLead * 4.5;
    const v2aShelfDb = ldrLead * 5.0;

    this.v1aCathodeShelf.setShelf("low", 140, v1aShelfDb, sampleRate);
    this.v1bCathodeShelf.setShelf("low", 180, v1bShelfDb, sampleRate);
    this.v2aCathodeShelf.setShelf("low", 210, v2aShelfDb, sampleRate);

    this.bassFilter.setShelf("low", 110, (bassVal - 5) * 1.7, sampleRate);
    this.midFilter.setPeaking(620, 1.1, (midVal - 5) * 1.9, sampleRate);
    this.trebleFilter.setShelf("high", 2400, (trebVal - 5) * 1.8, sampleRate);
    this.presenceFilter.setShelf("high", 4200, (presVal - 5) * 1.7, sampleRate);

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

    const ch = Math.round(parameters.channel[0]);
    const targetLdrLead = ch === 0 ? 0.0 : ch === 1 ? 0.65 : 1.0;
    const ldrCoeff = 1 - Math.exp(-1 / (0.025 * sampleRate));
    this.ldrLead += ldrCoeff * (targetLdrLead - this.ldrLead);

    this.updateFilters(parameters, this.ldrLead);

    const inRhy = 0.5 + (parameters.inputGainRhy[0] / 10) * 1.3;
    const r1G = 0.7 + (parameters.rhy1Gain[0] / 10) * 3.0;
    const l2G = 1.2 + (parameters.lead2Gain[0] / 10) * 5.5;
    const l3G = 1.6 + (parameters.lead3Gain[0] / 10) * 7.5;

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

      // Dynamics envelope follower
      const absS = Math.abs(input[i]) + ANTI_DENORMAL;
      const coeff = absS > this.env ? 0.005 : 0.0005;
      this.env += coeff * (absS - this.env);
      const dynGain = 1 / (1 + dynAmount * this.env * 2.2);

      // V1A input triode + cathode shelf + coupling HPF
      let s = input[i] * dynGain * inRhy;
      s = this.v1aCathodeShelf.process(s);
      s = triodeStage(s, 1.1 + r1G * 0.45, 0.14, 0.03);
      s = this.dcV1a.process(this.v1aCouplingHpf.process(s));

      // Channel / LDR routing through V1B & V2A lead stages
      if (ch === 0) {
        s = s * (0.65 + r1G * 0.55);
      } else {
        const stage2Drive = ch === 1 ? (0.8 + l2G * 0.45) : (1.0 + l2G * 0.4 + l3G * 0.35);
        s = this.v1bCathodeShelf.process(s * stage2Drive);
        s = triodeStage(s, 1.35 + l2G * 0.35, 0.18, 0.05);
        s = this.v1bCouplingHpf.process(s);

        if (ch === 2) {
          s = this.v2aCathodeShelf.process(s * (1.1 + l3G * 0.55));
          s = triodeStage(s, 1.65 + l3G * 0.4, 0.2, 0.06);
          s = this.v2aCouplingHpf.process(s);
        }
        s = this.dcLead.process(s);
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

      // Reverb, master, solo, optional 4x12 V30 cab, output level
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
