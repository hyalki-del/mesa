export async function startAudioEngine(onStatus) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx({ latencyHint: "interactive" });

  await ctx.audioWorklet.addModule(new URL("./dsp/markiv-worklet.js", import.meta.url));

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, "markiv-worklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1]
  });

  source.connect(worklet);
  worklet.connect(ctx.destination);

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  onStatus?.("Audio engine active");
  return { ctx, worklet };
}
