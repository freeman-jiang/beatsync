"use client";
import { SOCIAL_LINKS } from "@/constants";
import { MAX_NTP_MEASUREMENTS, useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { Crown, Hash, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { SyncProgress } from "../ui/SyncProgress";

interface TopBarProps {
  roomId: string;
}

export const TopBar = ({ roomId }: TopBarProps) => {
  const isLoadingAudio = useGlobalStore((state) => state.isInitingSystem);
  const isSynced = useGlobalStore((state) => state.isSynced);
  const roundTripEstimate = useGlobalStore((state) => state.roundTripEstimate);
  const connectedClients = useGlobalStore((state) => state.connectedClients);
  const clockOffset = useGlobalStore((state) => state.offsetEstimate);
  const ntpMeasurements = useGlobalStore((state) => state.ntpMeasurements);

  // Get current user ID to check admin status
  const userId = useRoomStore((state) => state.userId);
  const currentUser = connectedClients.find(
    (client) => client.clientId === userId
  );
  const isAdmin = currentUser?.isAdmin || false;

  // Show minimal nav bar when synced and not loading
  if (!isLoadingAudio && isSynced) {
    return (
      <div className="h-8 bg-black/80 backdrop-blur-md z-50 flex items-center justify-between px-4 border-b border-zinc-800">
        <div className="flex items-center space-x-4 text-xs text-neutral-400 py-2 md:py-0">
          {isAdmin && (
            <div className="flex items-center">
              <Crown className="h-3 w-3 text-green-500" fill="currentColor" />
            </div>
          )}
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
          {/* NTP Measurements Indicator */}
          <div className="items-center hidden md:flex">
            <motion.svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="mr-1"
            >
              <circle
                cx="7"
                cy="7"
                r="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-neutral-600"
              />
              <motion.circle
                cx="7"
                cy="7"
                r="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-green-500"
                strokeDasharray={`${
                  (ntpMeasurements.length / MAX_NTP_MEASUREMENTS) * 31.4
                } 31.4`}
                strokeLinecap="round"
                transform="rotate(-90 7 7)"
                initial={{ strokeDasharray: "0 31.4" }}
                animate={{
                  strokeDasharray: `${
                    (ntpMeasurements.length / MAX_NTP_MEASUREMENTS) * 31.4
                  } 31.4`,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              />
            </motion.svg>
            <span className="text-xs">
              {ntpMeasurements.length}/{MAX_NTP_MEASUREMENTS}
            </span>
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
        </div>

        <div className="flex items-center justify-center gap-2.5">
          {/* Discord icon */}
          <a
            href={SOCIAL_LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <FaDiscord className="size-[17px]" />
          </a>
          {/* GitHub icon in the top right */}
          <a
            href={SOCIAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <FaGithub className="size-4" />
          </a>
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
