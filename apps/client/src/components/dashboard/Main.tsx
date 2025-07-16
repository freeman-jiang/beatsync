import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Queue } from "../Queue";

export const Main = ({ setSelectedAppleMusicTrack, selectedAppleMusicTrack }: { setSelectedAppleMusicTrack: (track: any) => void, selectedAppleMusicTrack: any }) => {
  return (
    <motion.div
      className={cn(
        "w-full lg:flex-1 overflow-y-auto bg-gradient-to-b from-neutral-900/90 to-neutral-950 backdrop-blur-xl bg-neutral-950 h-full",
        "scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20"
      )}
    >
      <motion.div className="p-6 pt-4">
        {/* <h1 className="text-xl font-semibold mb-8">BeatSync</h1> */}
        <Queue className="mb-8" setSelectedAppleMusicTrack={setSelectedAppleMusicTrack} selectedAppleMusicTrack={selectedAppleMusicTrack} />
      </motion.div>
    </motion.div>
  );
};
