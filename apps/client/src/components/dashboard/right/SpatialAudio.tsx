import { UserGrid } from "@/components/room/UserGrid";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { motion } from "motion/react";
import { AudioControls } from "../AudioControls";

interface SpatialAudioProps {
  className?: string;
}

export const SpatialAudio = ({ className }: SpatialAudioProps) => {
  return (
    <motion.div className={cn("w-full h-full px-4", className)}>
      {/* Spatial Audio Controls */}
      <motion.div className="flex-1 flex flex-col">
        {/* Spatial Audio Grid */}
        <UserGrid />

        {/* Audio Effects Controls */}
        <AudioControls />
      </motion.div>

      <motion.div className="flex flex-col gap-3 px-4 py-3 mt-1 bg-neutral-800/30 rounded-lg mb-3 text-neutral-400">
        <div className="flex items-start gap-2">
          <div>
            <h5 className="text-xs font-medium text-neutral-300 mb-1 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
              What is this?
            </h5>
            <p className="text-xs leading-relaxed">
              {
                "This grid simulates a spatial audio environment. Drag the listening source around and hear how the volume changes on each device. Works best in person."
              }
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
