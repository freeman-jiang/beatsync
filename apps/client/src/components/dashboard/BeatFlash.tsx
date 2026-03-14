"use client";

import { useBeatTiming } from "@/hooks/useBeatTiming";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const HORIZONTAL_GRADIENT = "linear-gradient(90deg, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)";
const VERTICAL_GRADIENT = "linear-gradient(180deg, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)";
const GLOW = "0 0 20px 4px rgba(255,255,255,0.4), 0 0 50px 10px rgba(255,255,255,0.15)";

type Edge = "top" | "bottom" | "left" | "right";

const EDGES: readonly {
  edge: Edge;
  className: string;
  background: string;
  scaleAxis: "scaleX" | "scaleY";
}[] = [
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
];

export const BeatFlash = () => {
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

  // Clean up pending timeouts when deactivated
  useEffect(() => {
    if (!isMetronomeActive || !isSynced) {
      const timeouts = pendingTimeouts.current;
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
    }
  }, [isMetronomeActive, isSynced]);

  if (!isMetronomeActive || !isSynced) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {EDGES.map(({ edge, className, background, scaleAxis }) => (
        <motion.div
          key={`${beatKey}-${edge}`}
          className={className}
          style={{ background, boxShadow: GLOW }}
          initial={{ opacity: 1, [scaleAxis]: 0.3 }}
          animate={{ opacity: 0, [scaleAxis]: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};
