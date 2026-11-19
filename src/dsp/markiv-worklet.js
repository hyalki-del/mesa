const EQ_FREQS = {
  eq80: 80,
  eq240: 240,
  eq750: 750,
  eq2200: 2200,
  eq6600: 6600
};

function triodeStage(x, drive = 1.0, bias = 0.06) {
  const u = x * drive + bias;
  const pos = Math.tanh(u * 1.4);
  const neg = Math.tanh(u * 1.05);
  const y = u >= 0 ? pos : neg;
  const dcOffset = Math.tanh(bias * 1.2);
  return y - dcOffset;
}

class BiquadPeaking {
  constructor(freq, sr, q = 1.4) {
    this.freq = freq;
    this.sampleRate = sr;
    this.q = q;
    this.gainDb = null;
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.updateGain(0);
  }

  updateGain(gainDb) {
    if (this.gainDb !== null && Math.abs(gainDb - this.gainDb) < 1e-4) return;
    this.gainDb = gainDb;

    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * this.freq) / this.sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * this.q);

    const b0 = 1 + alpha * A;
    const b1 = -2 * cosW0;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha / A;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x) {
    const y =
      this.b0 * x +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;

    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

class MarkIVWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.eqFilters = {
      eq80: new BiquadPeaking(EQ_FREQS.eq80, sampleRate, 1.1),
      eq240: new BiquadPeaking(EQ_FREQS.eq240, sampleRate, 1.3),
      eq750: new BiquadPeaking(EQ_FREQS.eq750, sampleRate, 1.4),
      eq2200: new BiquadPeaking(EQ_FREQS.eq2200, sampleRate, 1.5),
      eq6600: new BiquadPeaking(EQ_FREQS.eq6600, sampleRate, 1.4)
    };
  }

  static get parameterDescriptors() {
    return [
      { name: "gain", defaultValue: 0.5, minValue: 0.0, maxValue: 1.0, automationRate: "a-rate" },
      { name: "eq80", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0, automationRate: "k-rate" },
      { name: "eq240", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0, automationRate: "k-rate" },
      { name: "eq750", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0, automationRate: "k-rate" },
      { name: "eq2200", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0, automationRate: "k-rate" },
      { name: "eq6600", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0, automationRate: "k-rate" }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outCh = output[0];
    const inCh = input && input[0] ? input[0] : null;
    const gainParam = parameters.gain;

    for (const key of Object.keys(this.eqFilters)) {
      const pVal = parameters[key]?.[0] ?? 0;
      this.eqFilters[key].updateGain(pVal * 12.0);
    }

    const f80 = this.eqFilters.eq80;
    const f240 = this.eqFilters.eq240;
    const f750 = this.eqFilters.eq750;
    const f2200 = this.eqFilters.eq2200;
    const f6600 = this.eqFilters.eq6600;

    for (let i = 0; i < outCh.length; i++) {
      const sampleIn = inCh ? inCh[i] : 0;
      const g = gainParam.length > 1 ? gainParam[i] : gainParam[0];
      const drive = 1.0 + g * 8.0;
      const s1 = triodeStage(sampleIn, drive, 0.06);
      const s2 = triodeStage(s1, 1.0 + g * 4.0, -0.04);

      let eqSig = f80.process(s2);
      eqSig = f240.process(eqSig);
      eqSig = f750.process(eqSig);
      eqSig = f2200.process(eqSig);
      eqSig = f6600.process(eqSig);

      outCh[i] = eqSig * 0.5;
    }

    return true;
  }
}

registerProcessor("markiv-worklet", MarkIVWorkletProcessor);
