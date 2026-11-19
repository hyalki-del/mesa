import { initControls } from "./ui/controls.js";

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggle-audio");

let ctx = null;
let worklet = null;
let stream = null;

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function applyParam(name, value) {
  if (!ctx || !worklet) return;
  const param = worklet.parameters.get(name);
  if (param) {
    param.setTargetAtTime(value, ctx.currentTime, 0.015);
  }
}

initControls((name, value) => {
  applyParam(name, value);
});

toggleBtn?.addEventListener("click", async () => {
  if (ctx) {
    await ctx.close();
    stream?.getTracks().forEach((t) => t.stop());
    ctx = null;
    worklet = null;
    stream = null;
    toggleBtn.textContent = "Start Audio";
    setStatus("Stopped");
    return;
  }

  try {
    setStatus("Requesting audio input...");
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx({ latencyHint: "interactive" });

    await ctx.audioWorklet.addModule(new URL("./dsp/markiv-worklet.js", import.meta.url));

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const source = ctx.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(ctx, "markiv-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });

    source.connect(worklet);
    worklet.connect(ctx.destination);

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const gainVal = parseFloat(document.getElementById("gain")?.value ?? "0.5");
    applyParam("gain", gainVal);

    toggleBtn.textContent = "Stop Audio";
    setStatus(`Running (${ctx.sampleRate} Hz)`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});
