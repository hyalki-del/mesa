// Asymmetric soft saturation inspired by triode transfer behavior
export function triodeStage(x, drive = 1.0, bias = 0.08) {
  const u = x * drive + bias;
  // Smooth asymmetric compression avoiding harsh hard clipping
  const pos = Math.tanh(u * 1.4);
  const neg = Math.tanh(u * 1.05);
  const y = u >= 0 ? pos : neg;
  const dcOffset = Math.tanh(bias * 1.2);
  return y - dcOffset;
}
