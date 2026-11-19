// Asymmetric soft saturation modeling triode-like transfer behavior
export function triodeStage(x, drive = 1.0, bias = 0.06) {
  const u = x * drive + bias;
  const pos = Math.tanh(u * 1.4);
  const neg = Math.tanh(u * 1.05);
  const y = u >= 0 ? pos : neg;
  const dcOffset = Math.tanh(bias * 1.2);
  return y - dcOffset;
}
