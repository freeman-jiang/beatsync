"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { throttle } from "throttle-debounce";
import { Slider } from "../ui/slider";

interface GlobalVolumeControlProps {
  className?: string;
  isMobile?: boolean;
}

export const GlobalVolumeControl = ({ className, isMobile = false }: GlobalVolumeControlProps) => {
  const currentUser = useGlobalStore((state) => state.currentUser);
  const isAdmin = !!currentUser?.isAdmin;
  const localVolume = useGlobalStore((state) => state.localVolume);
  const globalVolume = useGlobalStore((state) => state.globalVolume);
  const volumeControlScope = useGlobalStore((state) => state.volumeControlScope);
  const setLocalVolume = useGlobalStore((state) => state.setLocalVolume);
  const setGlobalVolume = useGlobalStore((state) => state.setGlobalVolume);
  const setVolumeControlScope = useGlobalStore((state) => state.setVolumeControlScope);
  const sendGlobalVolumeUpdate = useGlobalStore((state) => state.sendGlobalVolumeUpdate);
  const activeScope = volumeControlScope;
  const activeVolume = activeScope === "global" ? globalVolume : localVolume;
  const canControlActiveVolume = activeScope === "local" || isAdmin;
  const activeScopeLabel = activeScope === "global" ? "room" : "local";
  const volumeControlTitle = canControlActiveVolume
    ? `Adjust ${activeScopeLabel} volume`
    : "Room volume is controlled by admins";

  const [isDragging, setIsDragging] = useState(false);
  const [draftVolume, setDraftVolume] = useState(activeVolume);
  const displayVolume = isDragging ? draftVolume : activeVolume;

  // Create throttled version of sendGlobalVolumeUpdate
  const throttledSendGlobalUpdate = useMemo(
    () =>
      throttle(50, (volume: number) => {
        sendGlobalVolumeUpdate(volume);
      }),
    [sendGlobalVolumeUpdate]
  );

  // Get appropriate volume icon - rendered as element to avoid creating components during render
  const volumeIcon = useMemo(() => {
    const volume = displayVolume * 100;
    if (volume === 0) return <VolumeX className="h-4 w-4" />;
    if (volume < 50) return <Volume1 className="h-4 w-4" />;
    return <Volume2 className="h-4 w-4" />;
  }, [displayVolume]);

  // Handle slider change (while dragging) - send updates continuously
  const handleSliderChange = useCallback(
    (value: number[]) => {
      if (!canControlActiveVolume) return;

      const volume = value[0] / 100;

      setIsDragging(true);
      setDraftVolume(volume);

      if (activeScope === "global") {
        setGlobalVolume(volume);
        throttledSendGlobalUpdate(volume);
      } else {
        setLocalVolume(volume);
      }
    },
    [activeScope, canControlActiveVolume, setGlobalVolume, setLocalVolume, throttledSendGlobalUpdate]
  );

  // Handle slider release
  const handleSliderCommit = useCallback(
    (value: number[]) => {
      if (!canControlActiveVolume) return;

      // Send final value to ensure it's accurate
      const finalVolume = value[0] / 100;
      setDraftVolume(finalVolume);

      if (activeScope === "global") {
        setGlobalVolume(finalVolume);
        sendGlobalVolumeUpdate(finalVolume);
      } else {
        setLocalVolume(finalVolume);
      }

      // Mark as no longer dragging
      setIsDragging(false);
    },
    [activeScope, canControlActiveVolume, sendGlobalVolumeUpdate, setGlobalVolume, setLocalVolume]
  );

  const handleMuteToggle = useCallback(() => {
    if (!canControlActiveVolume) return;

    const newVolume = displayVolume > 0 ? 0 : 0.5;
    setDraftVolume(newVolume);

    if (activeScope === "global") {
      setGlobalVolume(newVolume);
      sendGlobalVolumeUpdate(newVolume);
    } else {
      setLocalVolume(newVolume);
    }
  }, [activeScope, canControlActiveVolume, displayVolume, sendGlobalVolumeUpdate, setGlobalVolume, setLocalVolume]);

  const handleScopeChange = useCallback(
    (scope: "local" | "global") => {
      const nextVolume = scope === "global" ? globalVolume : localVolume;
      setIsDragging(false);
      setDraftVolume(nextVolume);
      setVolumeControlScope(scope);
    },
    [globalVolume, localVolume, setVolumeControlScope]
  );

  const scopeToggle = (
    <div className={cn("inline-flex items-center rounded-md bg-neutral-800/70 p-0.5", isMobile ? "ml-2" : "")}>
      {(["local", "global"] as const).map((scope) => (
        <button
          key={scope}
          type="button"
          onClick={() => handleScopeChange(scope)}
          aria-pressed={activeScope === scope}
          aria-label={scope === "local" ? "Use local volume control" : "Use room volume control"}
          title={
            scope === "local"
              ? "Control volume on this device"
              : isAdmin
                ? "Control room volume for everyone"
                : "View room volume set by admins"
          }
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
            activeScope === scope ? "bg-neutral-200 text-neutral-950" : "text-neutral-400 hover:text-white"
          )}
        >
          {scope === "local" ? "Local" : "Room"}
        </button>
      ))}
    </div>
  );

  // Mobile layout (vertical, like PlaybackPermissions)
  if (isMobile) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5" />
            <span>{activeScope === "global" ? "Room Volume" : "Local Volume"}</span>
          </h2>
          {scopeToggle}
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 mt-2.5">
            <button
              className={cn(
                "text-neutral-400 transition-colors",
                canControlActiveVolume ? "hover:text-white" : "opacity-50"
              )}
              onClick={handleMuteToggle}
              disabled={!canControlActiveVolume}
              aria-label={`${displayVolume > 0 ? "Mute" : "Unmute"} ${activeScopeLabel} volume`}
              title={volumeControlTitle}
            >
              {volumeIcon}
            </button>
            <Slider
              value={[displayVolume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              disabled={!canControlActiveVolume}
              aria-label={`${activeScope === "global" ? "Room" : "Local"} volume`}
              title={volumeControlTitle}
              className={cn("flex-1", !canControlActiveVolume && "opacity-50")}
            />
            <div className="text-xs text-neutral-400 min-w-[3rem] text-right">{Math.round(displayVolume * 100)}%</div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop layout (horizontal, Spotify-style)
  return (
    <motion.div
      className={cn("flex items-center gap-2", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      {scopeToggle}
      <button
        className={cn("text-neutral-400 transition-colors", canControlActiveVolume ? "hover:text-white" : "opacity-50")}
        onClick={handleMuteToggle}
        disabled={!canControlActiveVolume}
        aria-label={`${displayVolume > 0 ? "Mute" : "Unmute"} ${activeScopeLabel} volume`}
        title={volumeControlTitle}
      >
        {volumeIcon}
      </button>
      <div className="w-24 flex items-center">
        <Slider
          value={[displayVolume * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          disabled={!canControlActiveVolume}
          aria-label={`${activeScope === "global" ? "Room" : "Local"} volume`}
          title={volumeControlTitle}
          className={cn("w-full", !canControlActiveVolume && "opacity-50")}
        />
      </div>
    </motion.div>
  );
};
