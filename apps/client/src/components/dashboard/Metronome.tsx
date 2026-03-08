"use client";

import { audioContextManager } from "@/lib/audioContextManager";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { epochNow } from "@beatsync/shared";
import { Metronome as MetronomeIcon } from "lucide-react";
import { useEffect, useRef } from "react";

const BEAT_INTERVAL_MS = 1000;
const NOISE_DURATION_S = 0.004;

export const MetronomeButton = () => {
  const isMetronomeActive = useGlobalStore((state) => state.isMetronomeActive);
  const toggleMetronome = useGlobalStore((state) => state.toggleMetronome);
  const isSynced = useGlobalStore((state) => state.isSynced);
  const lastBeatRef = useRef(-1);

  useEffect(() => {
    if (!isMetronomeActive || !isSynced) return;

    const ctx = audioContextManager.getContext();
    const sampleRate = ctx.sampleRate;

    // Pre-compute noise buffer — white noise is statistically identical every beat
    const noiseSamples = Math.ceil(sampleRate * NOISE_DURATION_S);
    const noiseBuf = ctx.createBuffer(1, noiseSamples, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    // Seed with current beat so we don't fire immediately on start
    const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
    const seedOffset = offsetEstimate + nudgeOffsetMs;
    lastBeatRef.current = Math.floor((epochNow() + seedOffset) / BEAT_INTERVAL_MS);

    const interval = setInterval(() => {
      // Read offset + nudge fresh each tick (avoids effect teardown on nudge change)
      const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
      const effectiveOffset = offsetEstimate + nudgeOffsetMs;
      const serverTimeMs = epochNow() + effectiveOffset;
      const beatIndex = Math.floor(serverTimeMs / BEAT_INTERVAL_MS);

      if (beatIndex === lastBeatRef.current) return;
      lastBeatRef.current = beatIndex;

      // Schedule click at the exact beat boundary using Web Audio
      const beatTimeMs = beatIndex * BEAT_INTERVAL_MS;
      const localBeatTimeMs = beatTimeMs - effectiveOffset;
      const delayS = Math.max(0, (localBeatTimeMs - epochNow()) / 1000);
      const startTime = ctx.currentTime + delayS;

      // Layer 1: Pitched body — lower fundamental, longer decay for more body
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(1200, startTime);
      osc.frequency.exponentialRampToValueAtTime(400, startTime + 0.04);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(1, startTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.065);

      // Layer 1b: Sub thump for weight
      const sub = ctx.createOscillator();
      sub.frequency.setValueAtTime(300, startTime);
      sub.frequency.exponentialRampToValueAtTime(80, startTime + 0.03);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.5, startTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(startTime);
      sub.stop(startTime + 0.055);

      // Layer 2: Noise transient for attack (bandpass-filtered burst)
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = 3500;
      bpf.Q.value = 2;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.003);
      noiseSrc.connect(bpf);
      bpf.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSrc.start(startTime);
      noiseSrc.stop(startTime + NOISE_DURATION_S);
    }, 10);

    return () => {
      clearInterval(interval);
    };
  }, [isMetronomeActive, isSynced]);

  if (!isSynced) return null;

  return (
    <button
      className={cn(
        "text-[10px] font-mono px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1",
        isMetronomeActive
          ? "bg-white text-black"
          : "text-neutral-500 bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-300"
      )}
      onClick={toggleMetronome}
    >
      <MetronomeIcon className="h-3 w-3" />
      {isMetronomeActive ? "stop" : "metronome"}
    </button>
  );
};
