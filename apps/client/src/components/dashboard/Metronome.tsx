"use client";

import { useBeatTiming } from "@/hooks/useBeatTiming";
import { audioContextManager } from "@/lib/audioContextManager";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Metronome as MetronomeIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

const KICK_URL = "/kick.wav";

/** Lazily fetch + decode the kick sample once, then cache it. Clears cache on failure so retries work. */
let kickBufferPromise: Promise<AudioBuffer> | null = null;
export function getKickBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!kickBufferPromise) {
    kickBufferPromise = fetch(KICK_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .catch((err) => {
        kickBufferPromise = null;
        throw err;
      });
  }
  return kickBufferPromise;
}

export const MetronomeButton = () => {
  const toggleMetronome = useGlobalStore((state) => state.toggleMetronome);
  const kickBufferRef = useRef<AudioBuffer | null>(null);

  const { isMetronomeActive, isSynced } = useBeatTiming({
    onBeat: useCallback((delayMs: number) => {
      const buffer = kickBufferRef.current;
      if (!buffer) return;

      const ctx = audioContextManager.getContext();
      const masterGain = audioContextManager.getMasterGain();
      const delayS = delayMs / 1000;
      const startTime = ctx.currentTime + delayS;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain);
      source.start(startTime);
    }, []),
  });

  // Pre-load the kick buffer as soon as we're synced (before metronome is toggled)
  useEffect(() => {
    if (!isSynced) return;

    const ctx = audioContextManager.getContext();
    let cancelled = false;

    getKickBuffer(ctx).then((buffer) => {
      if (!cancelled) kickBufferRef.current = buffer;
    });

    return () => {
      cancelled = true;
    };
  }, [isSynced]);

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
