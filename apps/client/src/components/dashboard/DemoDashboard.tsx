"use client";
import { cn, extractFileNameFromUrl } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { TopBar } from "../room/TopBar";
import { SyncProgress, WS_STATUS_COLORS } from "../ui/SyncProgress";
import { BeatPill, DemoBeatFlash } from "./BeatFlash";
import { Bottom } from "./Bottom";
import { RoomQRCode } from "./CopyRoom";
import { LowPassControl } from "./LowPassControl";

const CONNECTED_RGB = WS_STATUS_COLORS.connected;

const PulsingDot = () => (
  <span className="relative flex size-2.5">
    <span
      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
      style={{ backgroundColor: `rgb(${CONNECTED_RGB})` }}
    />
    <span
      className="relative inline-flex size-2.5 rounded-full"
      style={{
        backgroundColor: `rgb(${CONNECTED_RGB})`,
        boxShadow: `0 0 6px 1px rgba(${CONNECTED_RGB},0.5)`,
      }}
    />
  </span>
);

const DemoTrackSelector = () => {
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioUrl = useGlobalStore((state) => state.selectedAudioUrl);

  if (audioSources.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {audioSources.map((source) => {
        const isSelected = source.source.url === selectedAudioUrl;
        return (
          <button
            key={source.source.url}
            onClick={() => {
              if (isSelected) return;
              const { changeAudioSource, broadcastPlay, isPlaying } = useGlobalStore.getState();
              changeAudioSource(source.source.url);
              if (isPlaying) broadcastPlay(0);
            }}
            className={cn(
              "text-xs font-mono px-3 py-1.5 rounded-full transition-colors cursor-pointer truncate max-w-48",
              isSelected
                ? "bg-white text-black"
                : "text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-200"
            )}
          >
            {extractFileNameFromUrl(source.source.url)}
          </button>
        );
      })}
    </div>
  );
};

interface DemoDashboardProps {
  roomId: string;
}

export const DemoDashboard = ({ roomId }: DemoDashboardProps) => {
  const isSynced = useGlobalStore((state) => state.isSynced);
  const isLoadingAudio = useGlobalStore((state) => state.isInitingSystem);
  const hasUserStartedSystem = useGlobalStore((state) => state.hasUserStartedSystem);
  const demoUserCount = useGlobalStore((state) => state.demoUserCount);
  const isAdmin = useGlobalStore((state) => state.currentUser?.isAdmin ?? false);

  const isReady = isSynced && !isLoadingAudio;

  return (
    <div className="w-full h-dvh flex flex-col text-white bg-neutral-950">
      <DemoBeatFlash />
      <TopBar roomId={roomId} />

      {!isSynced && hasUserStartedSystem && !isLoadingAudio && <SyncProgress />}

      {isReady && (
        <motion.div
          className="relative flex flex-1 flex-col overflow-hidden min-h-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* Main content: just the user count */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3 text-neutral-400">
                <PulsingDot />
                <Users size={20} />
                <span className="text-sm font-medium tracking-wide uppercase">Connected</span>
              </div>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={demoUserCount}
                  className="text-8xl md:text-9xl font-bold tabular-nums tracking-tight"
                  initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -20, filter: "blur(4px)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  {demoUserCount}
                </motion.span>
              </AnimatePresence>
              <RoomQRCode />
              <BeatPill />
            </div>
          </div>

          {isAdmin && (
            <>
              <div className="absolute bottom-28 left-6 right-6 lg:right-auto">
                <DemoTrackSelector />
              </div>
              <div className="hidden lg:block absolute bottom-28 right-6 w-64">
                <LowPassControl />
              </div>
            </>
          )}

          <Bottom />
        </motion.div>
      )}
    </div>
  );
};
