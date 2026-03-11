"use client";

import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { Orbit, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../ui/button";
import { LowPassControl } from "./LowPassControl";

export const AudioControls = () => {
  const canMutate = useCanMutate();
  const startSpatialAudio = useGlobalStore((state) => state.startSpatialAudio);
  const stopSpatialAudio = useGlobalStore((state) => state.sendStopSpatialAudio);
  const isLoadingAudio = useGlobalStore((state) => state.isInitingSystem);

  const handleStartSpatialAudio = () => {
    if (!canMutate) return;
    startSpatialAudio();
  };

  const handleStopSpatialAudio = () => {
    if (!canMutate) return;
    stopSpatialAudio();
  };

  return (
    <motion.div className="space-y-2 py-3 mt-1">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Sparkles size={16} />
        <span>Audio Effects</span>
      </div>

      <div className="space-y-2">
        <motion.div
          className={cn(
            "bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors",
            !canMutate && "opacity-50"
          )}
        >
          <div className="flex justify-between items-center">
            <div className="text-xs text-neutral-300 flex items-center gap-1.5">
              <Orbit className="h-3 w-3 text-primary-500" />
              <span>Rotation</span>
            </div>
            <div className="flex gap-2">
              <Button
                className="text-xs px-3 py-1 h-auto bg-primary-600/80 hover:bg-primary-600 text-white"
                size="sm"
                onClick={handleStartSpatialAudio}
                disabled={isLoadingAudio || !canMutate}
              >
                Start
              </Button>
              <Button
                className="text-xs px-3 py-1 h-auto bg-neutral-700/60 hover:bg-neutral-700 text-white"
                size="sm"
                onClick={handleStopSpatialAudio}
                disabled={isLoadingAudio || !canMutate}
              >
                Stop
              </Button>
            </div>
          </div>
        </motion.div>
        <LowPassControl />
      </div>
    </motion.div>
  );
};
