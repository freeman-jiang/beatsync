"use client";
import { useGlobalStore } from "@/store/global";
import { Hash, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { SyncProgress } from "../ui/SyncProgress";

interface TopBarProps {
  roomId: string;
}

export const TopBar = ({ roomId }: TopBarProps) => {
  const isLoadingAudio = useGlobalStore((state) => state.isLoadingAudio);
  const isSynced = useGlobalStore((state) => state.isSynced);
  const offsetEstimate = useGlobalStore((state) => state.offsetEstimate);
  const roundTripEstimate = useGlobalStore((state) => state.roundTripEstimate);
  const sendNTPRequest = useGlobalStore((state) => state.sendNTPRequest);
  const resetNTPConfig = useGlobalStore((state) => state.resetNTPConfig);
  const pauseAudio = useGlobalStore((state) => state.pauseAudio);
  const connectedClients = useGlobalStore((state) => state.connectedClients);
  const setIsLoadingAudio = useGlobalStore((state) => state.setIsLoadingAudio);

  const resync = () => {
    try {
      pauseAudio({ when: 0 });
    } catch (error) {
      console.error("Failed to pause audio:", error);
    }
    resetNTPConfig();
    sendNTPRequest();
    setIsLoadingAudio(true);
  };

  // Show minimal nav bar when synced and not loading
  if (!isLoadingAudio && isSynced) {
    return (
      <div className="h-8 bg-black/80 backdrop-blur-md z-50 flex items-center px-4 border-b border-zinc-800">
        <div className="flex items-center space-x-4 text-xs text-neutral-400 py-2 md:py-0">
          <Link
            href="/"
            className="font-medium hover:text-white transition-colors"
          >
            Beatsync
          </Link>
          <div className="flex items-center">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></div>
            <span>Synced</span>
          </div>
          <div className="flex items-center">
            <Hash size={12} className="mr-1" />
            <span className="flex items-center">{roomId}</span>
          </div>
          <div className="flex items-center">
            <Users size={12} className="mr-1" />
            <span className="flex items-center">
              <span className="mr-1.5">
                {connectedClients.length}{" "}
                {connectedClients.length === 1 ? "user" : "users"}
              </span>
            </span>
          </div>
          {/* Hide separator on small screens */}
          <div className="hidden md:block">|</div>
          {/* Hide Offset/RTT on small screens */}
          <div className="hidden md:flex items-center space-x-2">
            <span>
              Offset: <span>{offsetEstimate.toFixed(2)}</span>ms
            </span>
            <span>RTT: {roundTripEstimate.toFixed(2)} ms</span>
          </div>
          {/* Hide separator on small screens */}
          <div className="hidden md:block">|</div>
          {/* Hide Full Sync button on small screens */}
          <button
            onClick={resync}
            className="hidden md:block text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            Full Sync
          </button>
        </div>
      </div>
    );
  }

  // Use the existing SyncProgress component for loading/syncing states
  return (
    <AnimatePresence>
      {isLoadingAudio && (
        <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <SyncProgress />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
