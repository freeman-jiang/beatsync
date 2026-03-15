"use client";

import { useBeatTiming } from "@/hooks/useBeatTiming";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Shared hook: subscribes to beat timing and returns a key that increments on each beat. */
const useBeatKey = () => {
  const [beatKey, setBeatKey] = useState(0);
  const pendingTimeouts = useRef(new Set<ReturnType<typeof setTimeout>>());

  const { isMetronomeActive, isSynced } = useBeatTiming({
    onBeat: useCallback((delayMs: number) => {
      const trigger = () => setBeatKey((k) => k + 1);

      if (delayMs < 50) {
        trigger();
      } else {
        const id = setTimeout(() => {
          pendingTimeouts.current.delete(id);
          trigger();
        }, delayMs);
        pendingTimeouts.current.add(id);
      }
    }, []),
  });

  useEffect(() => {
    if (!isMetronomeActive || !isSynced) {
      const timeouts = pendingTimeouts.current;
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
    }
  }, [isMetronomeActive, isSynced]);

  const isActive = isMetronomeActive && isSynced;
  return { beatKey, isActive };
};

export const BeatFlash = () => {
  const { beatKey, isActive } = useBeatKey();

  if (!isActive) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <motion.div
        key={`${beatKey}-bg`}
        className="absolute inset-0 bg-white/5"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
};

const PILL_COUNT = 4;

/** A row of pills that flash on each beat — place inline in the layout. */
export const BeatPill = () => {
  const { beatKey, isActive } = useBeatKey();

  if (!isActive) return null;

  return (
    <div className="flex gap-1.5 mt-4 w-32">
      {Array.from({ length: PILL_COUNT }, (_, i) => (
        <motion.div
          key={`${beatKey}-pill-${i}`}
          className="h-[3px] flex-1 rounded-full bg-white"
          initial={{
            opacity: 1,
            boxShadow: "0 0 8px 2px rgba(255,255,255,0.7), 0 0 20px 4px rgba(255,255,255,0.25)",
          }}
          animate={{
            opacity: 0.15,
            boxShadow: "0 0 0px 0px rgba(255,255,255,0), 0 0 0px 0px rgba(255,255,255,0)",
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};
