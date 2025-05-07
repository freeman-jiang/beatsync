/// <reference types="lucide-react" />
/// <reference types="motion/react" />
/// <reference types="next/link" />
"use client";
import { useGlobalStore } from "@/store/global";
import { Github, Hash, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { SyncProgress } from "../ui/SyncProgress";
import { QRCodeModal } from '../QRCodeModal';

interface TopBarProps {
  roomId: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export const TopBar = ({ roomId }: TopBarProps) => {
  const isLoadingAudio = useGlobalStore((state: any) => state.isInitingSystem);
  const isSynced = useGlobalStore((state: any) => state.isSynced);
  const roundTripEstimate = useGlobalStore((state: any) => state.roundTripEstimate);
  const sendNTPRequest = useGlobalStore((state: any) => state.sendNTPRequest);
  const resetNTPConfig = useGlobalStore((state: any) => state.resetNTPConfig);
  const pauseAudio = useGlobalStore((state: any) => state.pauseAudio);
  const connectedClients = useGlobalStore((state: any) => state.connectedClients);
  const setIsLoadingAudio = useGlobalStore((state: any) => state.setIsInitingSystem);
  const clockOffset = useGlobalStore((state: any) => state.offsetEstimate);
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
      <div className="h-8 bg-black/80 backdrop-blur-md z-50 flex items-center justify-between px-4 border-b border-zinc-800">
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
            <span>Offset: {clockOffset.toFixed(2)}ms</span>
            <span>
              RTT: <span>{roundTripEstimate.toFixed(2)}</span>ms
            </span>
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
          {/* Add QR Code Modal button */}
          <div className="hidden md:block">
            <QRCodeModal roomId={roomId} />
          </div>
        </div>

        {/* GitHub icon in the top right */}
        <a
          href="https://github.com/freeman-jiang/beatsync"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-400 hover:text-white transition-colors"
        >
          <Github size={16} />
        </a>
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
