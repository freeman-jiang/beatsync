"use client";

import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { throttle } from "throttle-debounce";
import { Slider } from "../ui/slider";

interface GlobalVolumeControlProps {
  className?: string;
  isMobile?: boolean;
}

export const GlobalVolumeControl = ({
  className,
  isMobile = false,
}: GlobalVolumeControlProps) => {
  const canMutate = useCanMutate();
  const globalVolume = useGlobalStore((state) => state.globalVolume);
  const sendGlobalVolumeUpdate = useGlobalStore(
    (state) => state.sendGlobalVolumeUpdate
  );

  // Local state for optimistic UI updates
  const [displayVolume, setDisplayVolume] = useState(globalVolume);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for smooth interpolation
  const targetVolumeRef = useRef(globalVolume);
  const currentVolumeRef = useRef(globalVolume);
  const animationFrameRef = useRef<number>(0);

  // Smooth interpolation for remote volume changes
  useEffect(() => {
    // Update target when globalVolume changes
    targetVolumeRef.current = globalVolume;

    // Don't interpolate if user is dragging
    if (isDragging) {
      return;
    }

    const animate = () => {
      // Calculate difference between target and current
      const diff = targetVolumeRef.current - currentVolumeRef.current;

      // If difference is very small, snap to target
      if (Math.abs(diff) < 0.001) {
        currentVolumeRef.current = targetVolumeRef.current;
        setDisplayVolume(currentVolumeRef.current);
        return;
      }

      // Move 30% of the way to target each frame (exponential ease-out)
      currentVolumeRef.current += diff * 0.25;
      setDisplayVolume(currentVolumeRef.current);

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [globalVolume, isDragging]);

  // Create throttled version of sendGlobalVolumeUpdate
  const throttledSendUpdate = useMemo(
    () =>
      throttle(50, (volume: number) => {
        sendGlobalVolumeUpdate(volume);
      }),
    [sendGlobalVolumeUpdate]
  );

  // Get appropriate volume icon
  const getVolumeIcon = (volume: number) => {
    if (volume === 0) return VolumeX;
    if (volume < 50) return Volume1;
    return Volume2;
  };

  const VolumeIcon = getVolumeIcon(displayVolume * 100);

  // Handle slider change (while dragging) - send updates continuously
  const handleSliderChange = useCallback(
    (value: number[]) => {
      if (!canMutate) {
        console.error("Cannot mutate global volume");
        return;
      }
      const volume = value[0] / 100;

      // Mark as dragging
      setIsDragging(true);

      // Update local state and refs immediately for smooth UI
      setDisplayVolume(volume);
      currentVolumeRef.current = volume;
      targetVolumeRef.current = volume;

      // Send throttled update to server
      throttledSendUpdate(volume);
    },
    [canMutate, throttledSendUpdate]
  );

  // Handle slider release
  const handleSliderCommit = useCallback(
    (value: number[]) => {
      if (!canMutate) return;

      // Send final value to ensure it's accurate
      const finalVolume = value[0] / 100;
      setDisplayVolume(finalVolume);
      currentVolumeRef.current = finalVolume;
      targetVolumeRef.current = finalVolume;
      sendGlobalVolumeUpdate(finalVolume);

      // Mark as no longer dragging
      setIsDragging(false);
    },
    [canMutate, sendGlobalVolumeUpdate]
  );

  // Mobile layout (vertical, like PlaybackPermissions)
  if (isMobile) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5" />
            <span>Global Volume</span>
          </h2>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 mt-2.5">
            <button
              className={cn(
                "text-neutral-400 transition-colors",
                canMutate ? "hover:text-white" : "opacity-50"
              )}
              disabled={!canMutate}
            >
              <VolumeIcon className="h-4 w-4" />
            </button>
            <Slider
              value={[displayVolume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              disabled={!canMutate}
              className={cn("flex-1", !canMutate && "opacity-50")}
            />
            <div className="text-xs text-neutral-400 min-w-[3rem] text-right">
              {Math.round(displayVolume * 100)}%
            </div>
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
      <button
        className={cn(
          "text-neutral-400 transition-colors",
          canMutate ? "hover:text-white" : "opacity-50"
        )}
        disabled={!canMutate}
        onClick={() => {
          if (!canMutate) return;
          // Toggle mute
          const newVolume = displayVolume > 0 ? 0 : 0.5;
          setDisplayVolume(newVolume);
          currentVolumeRef.current = newVolume;
          targetVolumeRef.current = newVolume;
          sendGlobalVolumeUpdate(newVolume);
        }}
      >
        <VolumeIcon className="h-4 w-4" />
      </button>
      <div className="w-24 flex items-center">
        <Slider
          value={[displayVolume * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          disabled={!canMutate}
          className={cn("w-full", !canMutate && "opacity-50")}
        />
      </div>
      {/* <div className="text-xs text-neutral-400 min-w-[2.5rem]">
        {Math.round(isDragging ? localVolume : globalVolume * 100)}%
      </div> */}
    </motion.div>
  );
};
