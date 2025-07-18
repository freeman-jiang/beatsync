import { motion } from "motion/react";
import { UnifiedPlayer } from "../UnifiedPlayer";

export const Bottom = () => {
  return (
    <motion.div className="flex-shrink-0 border-t border-neutral-800/50 bg-neutral-900/10 backdrop-blur-lg p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-10 relative">
      <div className="max-w-4xl mx-auto">
        <UnifiedPlayer />
      </div>
    </motion.div>
  );
};
