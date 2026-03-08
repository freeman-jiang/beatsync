"use client";

import { SOCIAL_LINKS } from "@/constants";
import { MAX_NTP_MEASUREMENTS, useGlobalStore } from "@/store/global";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface SyncProgressProps {
  // Loading state flags
  isLoading?: boolean; // Initial loading phase (room/socket/audio)
  loadingMessage?: string; // Message for initial loading phase

  // Sync state
  isSyncComplete?: boolean; // Whether sync is complete
}

const OuterModal = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-neutral-950 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-md px-1">{children}</div>
    </motion.div>
  );
};

const PILL_COUNT = 8;
const MEASUREMENTS_PER_PILL = MAX_NTP_MEASUREMENTS / PILL_COUNT;

export const SyncProgress = ({ isLoading = false, loadingMessage = "Loading..." }: SyncProgressProps) => {
  const measurementCount = useGlobalStore((state) => state.syncMeasurements.length);
  const isSyncComplete = useGlobalStore((state) => state.isSynced);
  const setIsInitingSystem = useGlobalStore((state) => state.setIsInitingSystem);
  const hasUserStartedSystem = useGlobalStore((state) => state.hasUserStartedSystem);

  const message = isLoading ? loadingMessage : "Synchronizing time...";

  // Number of lit pills: 0 during loading, then based on measurement count
  const litPills = isLoading ? 0 : Math.min(PILL_COUNT, Math.floor(measurementCount / MEASUREMENTS_PER_PILL));
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    if (!isSyncComplete) return;
    const timer = setTimeout(() => setShowComplete(true), 100);
    return () => clearTimeout(timer);
  }, [isSyncComplete]);

  const reconnectionInfo = useGlobalStore((state) => state.reconnectionInfo);

  // Check if max reconnection attempts have been reached
  const hasReconnectionFailed =
    reconnectionInfo.isReconnecting && reconnectionInfo.currentAttempt >= reconnectionInfo.maxAttempts;

  // If reconnection failed after max attempts
  if (hasReconnectionFailed) {
    return (
      <OuterModal>
        <motion.div
          className="flex flex-col items-center justify-center p-6 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.div
            className="size-6 flex items-center justify-center mb-2"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <motion.path
                d="M6 6L18 18M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Failed to reconnect
          </motion.h2>

          <motion.p
            className="text-neutral-400 mb-5 text-center text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Unable to establish connection after {reconnectionInfo.maxAttempts} attempts
          </motion.p>

          <motion.a
            href="/"
            className="mt-4 px-5 py-2 bg-primary text-primary-foreground rounded-full font-medium text-xs tracking-wide cursor-pointer w-full hover:shadow-lg hover:shadow-zinc-50/50 transition-shadow duration-500 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{
              scale: 1.015,
            }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.3 }}
          >
            Go to home
          </motion.a>

          <motion.p
            className="text-neutral-500 mt-4.5 text-center text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            Please check your connection and try again
          </motion.p>
        </motion.div>
      </OuterModal>
    );
  }

  // If reconnecting, show that instead of sync progress
  if (reconnectionInfo.isReconnecting) {
    return (
      <OuterModal>
        <motion.div
          className="flex flex-col items-center justify-center p-6 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.div
            className="size-12 flex items-center justify-center mb-2"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-primary"
            >
              <motion.circle
                cx="6"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
              />
              <motion.circle
                cx="12"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.circle
                cx="18"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            {"Reconnecting..."}
          </motion.h2>

          <motion.p
            className="text-neutral-400 mb-5 text-center text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Attempt {reconnectionInfo.currentAttempt} of {reconnectionInfo.maxAttempts}
          </motion.p>

          <motion.p
            className="text-neutral-500 mt-4.5 text-center text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            {
              "You might have a spotty connection or a new deployment is in progress. If this issue persists, please report it on the "
            }
            <a
              href={SOCIAL_LINKS.discord}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary/75 underline"
            >
              Discord
            </a>
            .
          </motion.p>
        </motion.div>
      </OuterModal>
    );
  }

  if (showComplete) {
    if (hasUserStartedSystem) {
      return null;
    }

    return (
      <OuterModal>
        <motion.div
          className="flex flex-col items-center justify-center p-6 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.div
            className="w-12 h-12 flex items-center justify-center mb-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-primary"
            >
              <motion.path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Synchronization Complete
          </motion.h2>

          <motion.p
            className="text-neutral-400 mb-5 text-center text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Your device is now synchronized with this room.
          </motion.p>

          <motion.button
            className="mt-4 px-5 py-4 md:py-2 bg-primary text-primary-foreground rounded-full font-medium text-sm md:text-xs tracking-wide cursor-pointer w-full shadow-lg shadow-zinc-50/50 md:shadow-none md:hover:shadow-lg md:hover:shadow-zinc-50/50 transition-shadow duration-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.3 }}
            onClick={() => setIsInitingSystem(false)}
          >
            Start System
          </motion.button>

          <motion.p
            className="text-neutral-500 mt-4.5 text-center text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            Use native device speakers.
          </motion.p>
        </motion.div>
      </OuterModal>
    );
  }

  return (
    <OuterModal>
      <motion.div
        className="flex flex-col items-center justify-center p-6 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <motion.h2
          className="text-base font-medium tracking-tight mb-1 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Beatsync calibrating
        </motion.h2>

        <motion.p
          className="text-neutral-400 mb-5 text-center text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {message}
        </motion.p>

        {/* Sync pills — 8 solid LED-style indicators */}
        <div className="flex gap-2 mt-4 mb-3 w-full">
          {Array.from({ length: PILL_COUNT }, (_, i) => {
            const lit = litPills > i;
            return (
              <div
                key={i}
                className="h-[3px] flex-1 rounded-full"
                style={{
                  backgroundColor: lit ? "#ffffff" : "rgba(255, 255, 255, 0.08)",
                  boxShadow: lit
                    ? "0 0 8px 2px rgba(255, 255, 255, 0.7), 0 0 20px 4px rgba(255, 255, 255, 0.25)"
                    : "none",
                  transition: "box-shadow 0.15s ease-out",
                }}
              />
            );
          })}
        </div>
      </motion.div>
    </OuterModal>
  );
};
