const EQ_BANDS = [
  { id: "eq80", label: "80 Hz", freq: 80 },
  { id: "eq240", label: "240 Hz", freq: 240 },
  { id: "eq750", label: "750 Hz", freq: 750 },
  { id: "eq2200", label: "2.2 kHz", freq: 2200 },
  { id: "eq6600", label: "6.6 kHz", freq: 6600 }
];

export function initControls(onParamChange) {
  const gainInput = document.getElementById("gain");
  const gainOut = document.getElementById("gain-val");
  const eqGrid = document.getElementById("eq-grid");

  gainInput?.addEventListener("input", () => {
    const val = parseFloat(gainInput.value);
    if (gainOut) gainOut.textContent = val.toFixed(2);
    onParamChange?.("gain", val);
  });

  if (eqGrid) {
    eqGrid.innerHTML = "";
    for (const band of EQ_BANDS) {
      const wrap = document.createElement("div");
      wrap.className = "eq-band";

      const title = document.createElement("span");
      title.textContent = band.label;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "-1";
      slider.max = "1";
      slider.step = "0.02";
      slider.value = "0";
      slider.id = band.id;

      const readOut = document.createElement("output");
      readOut.textContent = "0.00";

      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        readOut.textContent = val.toFixed(2);
        onParamChange?.(band.id, val);
      });

      wrap.append(title, slider, readOut);
      eqGrid.appendChild(wrap);
    }
  }
}
