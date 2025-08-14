import { motion } from "motion/react";
import { Player } from "../room/Player";
import { GlobalVolumeControl } from "./GlobalVolumeControl";

export const Bottom = () => {
  return (
    <motion.div className="flex-shrink-0 border-t border-neutral-800/50 bg-neutral-900/10 backdrop-blur-lg p-4 pb-safe-plus-4 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-10 relative">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex-1 max-w-3xl mx-auto">
          <Player />
        </div>
        <div className="hidden lg:block absolute right-6">
          <GlobalVolumeControl />
        </div>
      </div>
    </motion.div>
  );
};
