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

const HORIZONTAL_GRADIENT = "linear-gradient(90deg, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)";
const VERTICAL_GRADIENT = "linear-gradient(180deg, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)";
const EDGE_GLOW = "0 0 20px 4px rgba(255,255,255,0.4), 0 0 50px 10px rgba(255,255,255,0.15)";

const EDGES = [
  {
    edge: "top",
    className: "absolute top-0 left-0 right-0 h-[2px]",
    background: HORIZONTAL_GRADIENT,
    scaleAxis: "scaleX",
  },
  {
    edge: "bottom",
    className: "absolute bottom-0 left-0 right-0 h-[2px]",
    background: HORIZONTAL_GRADIENT,
    scaleAxis: "scaleX",
  },
  {
    edge: "left",
    className: "absolute top-0 bottom-0 left-0 w-[2px]",
    background: VERTICAL_GRADIENT,
    scaleAxis: "scaleY",
  },
  {
    edge: "right",
    className: "absolute top-0 bottom-0 right-0 w-[2px]",
    background: VERTICAL_GRADIENT,
    scaleAxis: "scaleY",
  },
] as const;

/** Subtle edge glow — for the regular (prod) dashboard. */
export const BeatFlash = () => {
  const { beatKey, isActive } = useBeatKey();

  if (!isActive) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {EDGES.map(({ edge, className, background, scaleAxis }) => (
        <motion.div
          key={`${beatKey}-${edge}`}
          className={className}
          style={{ background, boxShadow: EDGE_GLOW }}
          initial={{ opacity: 1, [scaleAxis]: 0.3 }}
          animate={{ opacity: 0, [scaleAxis]: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};

/** Full white screen flash — for the demo dashboard, visible from stage distance. */
export const DemoBeatFlash = () => {
  const { beatKey, isActive } = useBeatKey();

  if (!isActive) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <motion.div
        key={`${beatKey}-bg`}
        className="absolute inset-0 bg-white"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
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
    <div className="flex gap-2 mt-4 w-40">
      {Array.from({ length: PILL_COUNT }, (_, i) => (
        <motion.div
          key={`${beatKey}-pill-${i}`}
          className="h-1.5 flex-1 rounded-full bg-white"
          initial={{
            opacity: 1,
            boxShadow: "0 0 12px 3px rgba(255,255,255,0.8), 0 0 30px 8px rgba(255,255,255,0.3)",
          }}
          animate={{
            opacity: 0.1,
            boxShadow: "0 0 0px 0px rgba(255,255,255,0), 0 0 0px 0px rgba(255,255,255,0)",
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};
