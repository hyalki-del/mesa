import { initControls } from "./ui/controls.js";

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggle-audio");

let ctx = null;
let worklet = null;
let inputGainNode = null;
let bypassGainNode = null;
let wetGainNode = null;
let masterGainNode = null;
let analyser = null;
let meterTimer = null;
let stream = null;
let isBypassed = false;

function setStatus(msg) {
  console.log("[MarkIV]", msg);
  if (statusEl) statusEl.textContent = msg;
}

function updateRouting() {
  if (!ctx || !bypassGainNode || !wetGainNode) return;
  const now = ctx.currentTime;
  bypassGainNode.gain.setTargetAtTime(isBypassed ? 0.8 : 0.0, now, 0.015);
  wetGainNode.gain.setTargetAtTime(isBypassed ? 0.0 : 1.0, now, 0.015);
}

function applyParam(name, value) {
  if (!ctx) return;
  if (name === "inputBoost") {
    inputGainNode?.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
    return;
  }
  if (name === "bypass") {
    isBypassed = Boolean(value);
    updateRouting();
    return;
  }
  const param = worklet?.parameters.get(name);
  if (param) {
    param.setTargetAtTime(value, ctx.currentTime, 0.015);
  }
}

initControls((name, value) => {
  applyParam(name, value);
});

function startMeter() {
  clearInterval(meterTimer);
  if (!analyser) return;
  const data = new Float32Array(analyser.fftSize);
  meterTimer = setInterval(() => {
    if (!analyser || !statusEl || !ctx || ctx.state !== "running") return;
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    const db = peak > 1e-6 ? (20 * Math.log10(peak)).toFixed(1) : "-inf";
    statusEl.textContent = `Running (${ctx.sampleRate} Hz) | Input Peak: ${db} dBFS | Out: ${masterGainNode?.gain.value ?? 1}`;
  }, 120);
}

async function stopAudio() {
  clearInterval(meterTimer);
  meterTimer = null;
  analyser = null;
  inputGainNode = null;
  bypassGainNode = null;
  wetGainNode = null;
  masterGainNode = null;

  stream?.getTracks().forEach((t) => t.stop());
  stream = null;

  if (ctx) {
    await ctx.close();
    ctx = null;
  }
  worklet = null;

  if (toggleBtn) toggleBtn.textContent = "Start Audio";
  setStatus("Stopped");
}

toggleBtn?.addEventListener("click", async () => {
  if (!toggleBtn) return;

  if (ctx) {
    await stopAudio();
    return;
  }

  toggleBtn.disabled = true;
  setStatus("Starting audio...");

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx({ latencyHint: "interactive" });
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const workletUrl = new URL("./dsp/markiv-worklet.js", import.meta.url);
    await ctx.audioWorklet.addModule(workletUrl);

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const source = ctx.createMediaStreamSource(stream);
    inputGainNode = ctx.createGain();
    inputGainNode.gain.value = 5.0;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    worklet = new AudioWorkletNode(ctx, "markiv-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });

    worklet.onprocessorerror = (e) => {
      console.error("[MarkIV] Worklet processor error:", e);
      setStatus("Worklet error — check Console");
    };

    wetGainNode = ctx.createGain();
    bypassGainNode = ctx.createGain();
    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = 1.0;

    // Route both wet (worklet) and clean bypass into masterGain -> destination
    source.connect(inputGainNode);
    inputGainNode.connect(analyser);

    inputGainNode.connect(worklet);
    worklet.connect(wetGainNode);
    wetGainNode.connect(masterGainNode);

    inputGainNode.connect(bypassGainNode);
    bypassGainNode.connect(masterGainNode);

    masterGainNode.connect(ctx.destination);

    updateRouting();

    const gainVal = parseFloat(document.getElementById("gain")?.value ?? "0.5");
    applyParam("gain", gainVal);

    toggleBtn.textContent = "Stop Audio";
    startMeter();
  } catch (err) {
    console.error("[MarkIV] Start failed:", err);
    setStatus(`Error: ${err.message || err}`);
    await stopAudio();
  } finally {
    toggleBtn.disabled = false;
  }
});
