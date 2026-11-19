import { triodeStage } from "./nonlinear.js";

class MarkIVWorkletProcessor extends AudioWorkletProcessor {
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
    if (!input || !input[0] || !output || !output[0]) return true;

    const inCh = input[0];
    const outCh = output[0];
    const gainParam = parameters.gain;

    for (let i = 0; i < inCh.length; i++) {
      const g = gainParam.length > 1 ? gainParam[i] : gainParam[0];
      const drive = 1.0 + g * 8.0;
      const s1 = triodeStage(inCh[i], drive, 0.06);
      const s2 = triodeStage(s1, 1.0 + g * 4.0, -0.04);
      outCh[i] = s2 * 0.6;
    }

    return true;
  }
}

registerProcessor("markiv-worklet", MarkIVWorkletProcessor);
