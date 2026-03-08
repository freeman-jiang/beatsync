"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { epochNow } from "@beatsync/shared";
import { useEffect, useState } from "react";

const PILL_COUNT = 8;
const SWEEP_PERIOD_MS = 2000;

interface SyncVisualizerProps {
  className?: string;
}

export const SyncVisualizer = ({ className }: SyncVisualizerProps) => {
  const isSynced = useGlobalStore((state) => state.isSynced);
  const [activePill, setActivePill] = useState(0);

  useEffect(() => {
    if (!isSynced) return;

    const interval = setInterval(() => {
      const { offsetEstimate, nudgeOffsetMs } = useGlobalStore.getState();
      const effectiveOffset = offsetEstimate + nudgeOffsetMs;
      const serverTimeMs = epochNow() + effectiveOffset;
      const positionInSweep = serverTimeMs % SWEEP_PERIOD_MS;
      const pillIndex = Math.floor((positionInSweep / SWEEP_PERIOD_MS) * PILL_COUNT);
      setActivePill((prev) => (prev === pillIndex ? prev : pillIndex));
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [isSynced]);

  if (!isSynced) return null;

  return (
    <div className={cn("flex gap-1", className)}>
      {Array.from({ length: PILL_COUNT }, (_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 rounded-full"
          style={{
            backgroundColor: activePill === i ? "#ffffff" : "rgba(255, 255, 255, 0.06)",
            boxShadow:
              activePill === i ? "0 0 6px 1px rgba(255, 255, 255, 0.6), 0 0 12px 3px rgba(255, 255, 255, 0.2)" : "none",
            transition: "background-color 0.05s, box-shadow 0.05s",
          }}
        />
      ))}
    </div>
  );
};
