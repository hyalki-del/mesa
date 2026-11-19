export function initControls(onChange) {
  const ranges = document.querySelectorAll('input[type="range"]');
  ranges.forEach((input) => {
    const label = document.querySelector(`.val[data-for="${input.id}"]`);
    const updateLabel = () => {
      const num = parseFloat(input.value);
      if (label) {
        label.textContent = input.id.startsWith("eq")
          ? `${num > 0 ? "+" : ""}${num.toFixed(1)} dB`
          : num.toFixed(1);
      }
      onChange(input.id, num);
    };
    input.addEventListener("input", updateLabel);
    updateLabel();
  });

  const chButtons = document.querySelectorAll(".ch-btn");
  const ledRhy1 = document.getElementById("led-rhy1");
  const ledLead2 = document.getElementById("led-lead2");
  const ledLead3 = document.getElementById("led-lead3");

  chButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = parseInt(btn.dataset.channel, 10);
      chButtons.forEach((b) => b.classList.toggle("active", b === btn));
      ledRhy1?.classList.toggle("on", ch === 0);
      ledLead2?.classList.toggle("on", ch === 1);
      ledLead3?.classList.toggle("on", ch === 2);
      onChange("channel", ch);
    });
  });

  function bindToggle(id, paramName, onText, offText, initial = true, ledId = null) {
    const btn = document.getElementById(id);
    const led = ledId ? document.getElementById(ledId) : null;
    let state = initial;
    const sync = () => {
      if (btn) {
        btn.textContent = state ? onText : offText;
        btn.classList.toggle("active", state);
      }
      if (led) led.classList.toggle("on", state);
      onChange(paramName, state ? 1 : 0);
    };
    btn?.addEventListener("click", () => {
      state = !state;
      sync();
    });
    sync();
  }

  bindToggle("eq-toggle", "eqOn", "EQ: ON", "EQ: OFF", true);
  bindToggle("solo-toggle", "soloOn", "SOLO: ON", "SOLO: OFF", false);
  bindToggle("standby-toggle", "standbyOn", "STANDBY: ON", "STANDBY: OFF", true, "led-standby");
  bindToggle("power-toggle", "powerOn", "POWER: ON", "POWER: OFF", true, "led-power");
}
