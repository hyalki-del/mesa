import { initControls } from "./ui/controls.js";

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggle-audio");

let ctx = null;
let worklet = null;
let stream = null;
let fallbackOsc = null;

function setStatus(msg) {
  console.log("[MarkIV]", msg);
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

async function stopAudio() {
  try {
    fallbackOsc?.stop();
  } catch (_) {}
  fallbackOsc = null;

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
    if (!AudioCtx) {
      throw new Error("Web Audio API not supported in this browser.");
    }

    ctx = new AudioCtx({ latencyHint: "interactive" });
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const workletUrl = new URL("./dsp/markiv-worklet.js", import.meta.url);
    await ctx.audioWorklet.addModule(workletUrl);

    worklet = new AudioWorkletNode(ctx, "markiv-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });

    let inputConnected = false;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        const micSource = ctx.createMediaStreamSource(stream);
        micSource.connect(worklet);
        inputConnected = true;
      } catch (micErr) {
        console.warn("[MarkIV] Mic unavailable, using test tone:", micErr);
      }
    }

    if (!inputConnected) {
      // Low test signal so you can verify DSP & EQ without a physical mic/interface
      fallbackOsc = ctx.createOscillator();
      const testGain = ctx.createGain();
      fallbackOsc.type = "sawtooth";
      fallbackOsc.frequency.value = 110; // A2 guitar-range test tone
      testGain.gain.value = 0.05;
      fallbackOsc.connect(testGain);
      testGain.connect(worklet);
      fallbackOsc.start();
    }

    worklet.connect(ctx.destination);

    const gainVal = parseFloat(document.getElementById("gain")?.value ?? "0.5");
    applyParam("gain", gainVal);

    toggleBtn.textContent = "Stop Audio";
    setStatus(
      inputConnected
        ? `Running (Mic/DI @ ${ctx.sampleRate} Hz)`
        : `Running (110Hz Test Tone @ ${ctx.sampleRate} Hz)`
    );
  } catch (err) {
    console.error("[MarkIV] Start failed:", err);
    setStatus(`Error: ${err.message || err}`);
    await stopAudio();
  } finally {
    toggleBtn.disabled = false;
  }
});
