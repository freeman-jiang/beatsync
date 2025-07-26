"use client";

import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { Hash, Search } from "lucide-react";
import { motion } from "motion/react";
import { AudioUploaderMinimal } from "../AudioUploaderMinimal";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { ConnectedUsersList } from "./ConnectedUsersList";
import { PlaybackPermissions } from "./PlaybackPermissions";

interface LeftProps {
  className?: string;
}

export const Left = ({ className }: LeftProps) => {
  // const shareRoom = () => {
  //   try {
  //     navigator.share({
  //       title: "Join my BeatSync room",
  //       text: `Join my BeatSync room with code: ${roomId}`,
  //       url: window.location.href,
  //     });
  //   } catch {
  //     copyRoomId();
  //   }
  // };

  const roomId = useRoomStore((state) => state.roomId);

  return (
    <motion.div
      className={cn(
        "w-full lg:w-80 lg:flex-shrink-0 border-l border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col pb-4 lg:pb-0 text-sm space-y-1 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20",
        className
      )}
    >
      {/* Header section */}
      {/* <div className="px-3 py-2 flex items-center gap-2">
        <div className="bg-neutral-800 rounded-md p-1.5">
          <Music className="h-4 w-4 text-white" />
        </div>
        <h1 className="font-semibold text-white">Beatsync</h1>
      </div>


      <Separator className="bg-neutral-800/50" /> */}

      {/* Navigation menu */}
      <motion.div className="px-3.5 space-y-2.5 py-2 mt-1">
        <div className="flex items-center gap-2 font-medium">
          <Hash size={18} />
          <span>Room {roomId}</span>
        </div>

        <a href="https://ytmp3.cx/" target="_blank">
          <Button
            className="w-full flex justify-start gap-3 py-2 text-white font-medium bg-white/10 hover:bg-white/15 rounded-lg text-xs transition-colors duration-200 cursor-pointer"
            variant="ghost"
          >
            <Search className="h-4 w-4" />
            <span>Search Music</span>
          </Button>
        </a>
      </motion.div>

      <Separator className="bg-neutral-800/50" />

      <PlaybackPermissions />

      <Separator className="bg-neutral-800/50" />

      {/* Connected Users List */}
      <ConnectedUsersList />

      {/* Playback Permissions */}

      {/* <Separator className="bg-neutral-800/50" /> */}

      {/* Tips Section */}
      <motion.div className="mt-auto pb-4 pt-2 text-neutral-400">
        <div className="flex flex-col gap-2 p-4 border-t border-neutral-800/50">
          <h5 className="text-xs font-medium text-neutral-300">Tips</h5>
          <ul className="list-disc list-outside pl-4 space-y-1.5">
            <li className="text-xs leading-relaxed">
              {"Play on speaker directly. Don't use Bluetooth."}
            </li>
          </ul>
        </div>

        <div className="pl-1">
          <AudioUploaderMinimal />
        </div>
      </motion.div>
    </motion.div>
  );
};
