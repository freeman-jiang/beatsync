"use client";
import { SOCIAL_LINKS } from "@/constants";
import { audioContextManager } from "@/lib/audioContextManager";
import { cn } from "@/lib/utils";
import { MAX_NTP_MEASUREMENTS, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Crown, Hash, Lock, LockOpen, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { SyncProgress } from "../ui/SyncProgress";
import { useChatStore } from "@/store/chat";

interface TopBarProps {
  roomId: string;
}

export const TopBar = ({ roomId }: TopBarProps) => {
  const isLoadingAudio = useGlobalStore((state) => state.isInitingSystem);
  const isSynced = useGlobalStore((state) => state.isSynced);
  const roundTripEstimate = useGlobalStore((state) => state.roundTripEstimate);
  const connectedClientCount = useGlobalStore((state) => state.connectedClients.length);
  const clockOffset = useGlobalStore((state) => state.offsetEstimate);
  const syncMeasurementCount = useGlobalStore((state) => state.syncMeasurements.length);
  const socket = useGlobalStore((state) => state.socket);

  // Get current user from global store to check admin status
  const currentUser = useGlobalStore((state) => state.currentUser);
  const isAdmin = currentUser?.isAdmin || false;
  const isRoomPrivate = useChatStore((state) => state.isRoomPrivate);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const handleSetPin = () => {
    if (!socket) return;
    if (pinInput && !/^\d{6}$/.test(pinInput)) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }
    const targetPassword = pinInput.length === 6 ? pinInput : null;
    if (targetPassword) {
      sessionStorage.setItem(`room-password-${roomId}`, targetPassword);
    } else {
      sessionStorage.removeItem(`room-password-${roomId}`);
    }
    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.SET_ROOM_PASSWORD,
        password: targetPassword,
      },
    });
    setPinDialogOpen(false);
    setPinInput("");
    setPinError(null);
  };

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
          <Link href="/" className="font-medium hover:text-white transition-colors">
            Beatsync
          </Link>

          {/* NTP Measurements Indicator */}
          <div className="items-center hidden md:flex">
            <motion.svg width="14" height="14" viewBox="0 0 14 14" className="mr-1">
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
                strokeDasharray={`${(syncMeasurementCount / MAX_NTP_MEASUREMENTS) * 31.4} 31.4`}
                strokeLinecap="round"
                transform="rotate(-90 7 7)"
                initial={{ strokeDasharray: "0 31.4" }}
                animate={{
                  strokeDasharray: `${(syncMeasurementCount / MAX_NTP_MEASUREMENTS) * 31.4} 31.4`,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              />
            </motion.svg>
            <span className="text-xs">
              {syncMeasurementCount}/{MAX_NTP_MEASUREMENTS}
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
                {connectedClientCount} {connectedClientCount === 1 ? "user" : "users"}
              </span>
            </span>
          </div>
          {/* Hide separator on small screens */}
          <div className="hidden md:block">|</div>
          {/* Hide Offset/RTT on small screens */}
          <div className="hidden md:flex items-center space-x-2">
            <span>Offset: {clockOffset.toFixed(2)}ms</span>
            <span>RTT: {roundTripEstimate.toFixed(2)}ms</span>
            <span>OL: {((audioContextManager.getContext().outputLatency ?? 0) * 1000).toFixed(0)}ms</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2.5">
          {/* Admin PIN button */}
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => {
                  setPinDialogOpen((o) => !o);
                  setPinError(null);
                }}
                title={isRoomPrivate ? "Change room PIN" : "Set room PIN"}
                className={cn(
                  "flex items-center gap-1 text-xs transition-colors outline-none rounded-sm",
                  isRoomPrivate ? "text-primary hover:text-primary/80" : "text-neutral-400 hover:text-white"
                )}
              >
                {isRoomPrivate ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
              <AnimatePresence>
                {pinDialogOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-6 z-50 w-60 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl shadow-black/60"
                  >
                    <p className="mb-2 text-xs font-semibold text-neutral-200">
                      {isRoomPrivate ? "Change or disable PIN" : "Set room PIN"}
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN (blank = disable)"
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setPinError(null);
                      }}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-primary/60 mb-2"
                    />
                    {pinError && <p className="mb-2 text-[11px] text-red-400">{pinError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSetPin}
                        className="flex-1 rounded-lg bg-primary/90 hover:bg-primary text-black text-xs font-semibold py-1.5 transition-colors"
                      >
                        {pinInput ? "Set PIN" : "Remove PIN"}
                      </button>
                      <button
                        onClick={() => {
                          setPinDialogOpen(false);
                          setPinInput("");
                          setPinError(null);
                        }}
                        className="flex-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
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
