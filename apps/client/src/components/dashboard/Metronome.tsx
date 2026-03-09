"use client";

import { audioContextManager } from "@/lib/audioContextManager";
import { cn } from "@/lib/utils";
import { getFilteredOutputLatencyMs, useGlobalStore } from "@/store/global";
import { epochNow } from "@beatsync/shared";
import { Metronome as MetronomeIcon } from "lucide-react";
import { useEffect, useRef } from "react";

const BEAT_INTERVAL_MS = 1000;
const WOODBLOCK_URL = "/woodblock.wav";

/** Lazily fetch + decode the woodblock sample once, then cache it. Clears cache on failure so retries work. */
let clickBufferPromise: Promise<AudioBuffer> | null = null;
export function getClickBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!clickBufferPromise) {
    clickBufferPromise = fetch(WOODBLOCK_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .catch((err) => {
        clickBufferPromise = null;
        throw err;
      });
  }
  return clickBufferPromise;
}

export const MetronomeButton = () => {
  const isMetronomeActive = useGlobalStore((state) => state.isMetronomeActive);
  const toggleMetronome = useGlobalStore((state) => state.toggleMetronome);
  const isSynced = useGlobalStore((state) => state.isSynced);
  const lastBeatRef = useRef(-1);

  useEffect(() => {
    if (!isMetronomeActive || !isSynced) return;

    const ctx = audioContextManager.getContext();
    let cancelled = false;
    let cleanupRef: (() => void) | null = null;

    getClickBuffer(ctx).then((clickBuffer) => {
      if (cancelled) return;

      // Seed with current beat so we don't fire immediately on start
      const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
      const seedOffset = offsetEstimate + nudgeOffsetMs;
      lastBeatRef.current = Math.floor((epochNow() + seedOffset) / BEAT_INTERVAL_MS);

      const interval = setInterval(() => {
        const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
        const effectiveOffset = offsetEstimate + nudgeOffsetMs;
        const now = epochNow();
        const serverTimeMs = now + effectiveOffset;
        const beatIndex = Math.floor(serverTimeMs / BEAT_INTERVAL_MS);

        if (beatIndex === lastBeatRef.current) return;
        lastBeatRef.current = beatIndex;

        // Schedule click at the exact beat boundary — same path as real track playback
        const beatTimeMs = beatIndex * BEAT_INTERVAL_MS;
        const localBeatTimeMs = beatTimeMs - effectiveOffset;
        const outputLatencyMs = getFilteredOutputLatencyMs();
        const delayS = Math.max(0, (localBeatTimeMs - now - outputLatencyMs) / 1000);
        const startTime = ctx.currentTime + delayS;

        const source = ctx.createBufferSource();
        source.buffer = clickBuffer;
        source.connect(ctx.destination);
        source.start(startTime);
      }, 10);

      cleanupRef = () => clearInterval(interval);
    });

    return () => {
      cancelled = true;
      cleanupRef?.();
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
