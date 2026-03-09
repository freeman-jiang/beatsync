"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MetronomeButton } from "./Metronome";

const STEP_OPTIONS = [10, 50, 100] as const;

export const NudgeControl = () => {
  const nudge = useGlobalStore((state) => state.nudge);
  const nudgeOffsetMs = useGlobalStore((state) => state.nudgeOffsetMs);
  const [stepIndex, setStepIndex] = useState(1); // default 50ms

  const step = STEP_OPTIONS[stepIndex];

  const cycleStep = () => {
    setStepIndex((i) => (i + 1) % STEP_OPTIONS.length);
  };

  return (
    <motion.div
      className="flex flex-col items-start gap-1.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2">
        <button
          className="text-neutral-400 hover:text-white transition-colors p-1 rounded-sm hover:bg-neutral-800"
          onClick={() => nudge({ amountMs: step })}
          title="Play earlier"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            "text-[11px] font-mono min-w-[3.5rem] text-center tabular-nums",
            nudgeOffsetMs < 0 ? "text-green-500/70" : nudgeOffsetMs > 0 ? "text-red-500/70" : "text-neutral-400"
          )}
        >
          {-nudgeOffsetMs >= 0 ? "+" : ""}
          {-nudgeOffsetMs}ms
        </span>
        <button
          className="text-neutral-400 hover:text-white transition-colors p-1 rounded-sm hover:bg-neutral-800"
          onClick={() => nudge({ amountMs: -step })}
          title="Play later"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        <button
          className="text-[9px] font-mono text-neutral-500 size-6 rounded-full bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-300 transition-colors cursor-pointer flex items-center justify-center"
          onClick={cycleStep}
          title="Click to change step size"
        >
          {step}
        </button>
      </div>
      <MetronomeButton />
    </motion.div>
  );
};
