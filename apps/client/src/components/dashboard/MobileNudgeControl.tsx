"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Minus, Plus, Timer } from "lucide-react";
import { useState } from "react";
import { MetronomeButton } from "./Metronome";

const STEP_OPTIONS = [10, 50, 100] as const;

export const MobileNudgeControl = () => {
  const nudge = useGlobalStore((state) => state.nudge);
  const nudgeOffsetMs = useGlobalStore((state) => state.nudgeOffsetMs);
  const [stepIndex, setStepIndex] = useState(1); // default 50ms

  const step = STEP_OPTIONS[stepIndex];

  const cycleStep = () => {
    setStepIndex((i) => (i + 1) % STEP_OPTIONS.length);
  };

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
          <Timer className="h-3.5 w-3.5" />
          <span>Timing Nudge</span>
        </h2>
        <button
          className="text-[10px] font-mono text-neutral-500 px-2 py-0.5 rounded bg-neutral-800 active:bg-neutral-700 transition-colors"
          onClick={cycleStep}
        >
          {step}ms step
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-3 mt-2.5">
          <button
            className="text-neutral-400 active:text-white transition-colors p-2 rounded-md active:bg-neutral-800"
            onClick={() => nudge({ amountMs: -step })}
          >
            <Minus className="h-4 w-4" />
          </button>

          <span
            className={cn(
              "text-sm font-mono flex-1 text-center tabular-nums",
              nudgeOffsetMs < 0 ? "text-green-500/70" : nudgeOffsetMs > 0 ? "text-red-500/70" : "text-neutral-400"
            )}
          >
            {-nudgeOffsetMs >= 0 ? "+" : ""}
            {-nudgeOffsetMs}ms
          </span>

          <button
            className="text-neutral-400 active:text-white transition-colors p-2 rounded-md active:bg-neutral-800"
            onClick={() => nudge({ amountMs: step })}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          <MetronomeButton />
        </div>
      </div>
    </div>
  );
};
