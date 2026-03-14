import { getFilteredOutputLatencyMs, useGlobalStore } from "@/store/global";
import { epochNow } from "@beatsync/shared";
import { useEffect, useRef } from "react";

const BEAT_INTERVAL_MS = 1000;
const POLL_INTERVAL_MS = 10;

/**
 * Calls `onBeat` at each metronome beat boundary, latency-compensated.
 * The callback receives `delayMs` — how far in the future the beat should fire
 * (already accounting for output latency). For audio scheduling, convert to
 * seconds and add to `ctx.currentTime`. For visual effects, use `setTimeout`.
 *
 * Only fires when metronome is active and NTP is synced.
 */
export function useBeatTiming(data: { onBeat: (delayMs: number) => void }) {
  const { onBeat } = data;
  const lastBeatRef = useRef(-1);
  const onBeatRef = useRef(onBeat);

  const isMetronomeActive = useGlobalStore((state) => state.isMetronomeActive);
  const isSynced = useGlobalStore((state) => state.isSynced);

  useEffect(() => {
    onBeatRef.current = onBeat;
  });

  useEffect(() => {
    if (!isMetronomeActive || !isSynced) {
      lastBeatRef.current = -1;
      return;
    }

    // Seed with current beat so we don't fire immediately on start
    const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
    const seedOffset = offsetEstimate + nudgeOffsetMs;
    lastBeatRef.current = Math.floor((epochNow() + seedOffset) / BEAT_INTERVAL_MS);

    const interval = setInterval(() => {
      if (document.hidden) return;

      const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
      const effectiveOffset = offsetEstimate + nudgeOffsetMs;
      const now = epochNow();
      const serverTimeMs = now + effectiveOffset;
      const beatIndex = Math.floor(serverTimeMs / BEAT_INTERVAL_MS);

      if (beatIndex === lastBeatRef.current) return;
      lastBeatRef.current = beatIndex;

      const beatTimeMs = beatIndex * BEAT_INTERVAL_MS;
      const localBeatTimeMs = beatTimeMs - effectiveOffset;
      const outputLatencyMs = getFilteredOutputLatencyMs();
      const delayMs = Math.max(0, localBeatTimeMs - now - outputLatencyMs);

      onBeatRef.current(delayMs);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isMetronomeActive, isSynced]);

  return { isMetronomeActive, isSynced };
}
