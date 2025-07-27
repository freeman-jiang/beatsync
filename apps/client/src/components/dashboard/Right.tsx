import { cn } from "@/lib/utils";
import { Info, Youtube, Music } from "lucide-react";
import { motion } from "motion/react";
import { UserGrid } from "../room/UserGrid";
import { useGlobalStore } from "@/store/global";
import { AudioControls } from "./AudioControls";

interface RightProps {
  className?: string;
}

export const Right = ({ className }: RightProps) => {
  const currentMode = useGlobalStore((state) => state.currentMode);

  return (
    <motion.div
      className={cn(
        "w-full lg:w-80 lg:flex-shrink-0 border-l border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col pb-4 lg:pb-0 text-sm space-y-1 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20",
        className
      )}
    >
      {/* Spatial Audio Controls */}
      <motion.div className="flex-1 flex flex-col">
        {/* Spatial Audio Grid */}
        <UserGrid />

        {/* Audio Effects Controls */}
        <AudioControls />
      </motion.div>

      <motion.div className="flex flex-col gap-3 px-4 py-3 mt-1 bg-neutral-800/30 rounded-lg mx-3 mb-3 text-neutral-400">
        <div className="flex items-start gap-2">
          <div>
            {currentMode === 'library' ? (
              <>
                <h5 className="text-xs font-medium text-neutral-300 mb-1 flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
                  Music Library Mode
                </h5>
                <p className="text-xs leading-relaxed">
                  Upload your own audio files to play synchronized music across all connected devices in the room.
                </p>
                <p className="text-xs leading-relaxed mt-2">
                  Use the spatial audio grid above to control how audio sounds on different devices.
                </p>
              </>
            ) : (
              <>
                <h5 className="text-xs font-medium text-neutral-300 mb-1 flex items-center gap-1.5">
                  <Youtube className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  YouTube Mode
                </h5>
                <p className="text-xs leading-relaxed">
                  Add YouTube videos by URL or video ID to play synchronized across all devices.
                </p>
                <p className="text-xs leading-relaxed mt-2">
                  All users will see and hear the same video at the same time.
                </p>
              </>
            )}
            
            <div className="mt-3 pt-2 border-t border-neutral-700/50">
              <h6 className="text-xs font-medium text-neutral-300 mb-1 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
                Spatial Audio Grid
              </h6>
              <p className="text-xs leading-relaxed">
                The grid above simulates spatial audio. Drag the headphone icon (🎧) around to hear how volume changes on each device.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
