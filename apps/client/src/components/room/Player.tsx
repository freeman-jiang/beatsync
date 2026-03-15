import { cn, formatTime } from "@/lib/utils";

import { useCanMutate, useGlobalStore } from "@/store/global";
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "../ui/slider";

export const Player = () => {
  const canMutate = useCanMutate();
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const getCurrentTrackPosition = useGlobalStore((state) => state.getCurrentTrackPosition);
  const audioSourceCount = useGlobalStore((state) => state.audioSources.length);
  const currentTime = useGlobalStore((state) => state.currentTime);
  const skipToNextTrack = useGlobalStore((state) => state.skipToNextTrack);
  const skipToPreviousTrack = useGlobalStore((state) => state.skipToPreviousTrack);
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const toggleShuffle = useGlobalStore((state) => state.toggleShuffle);
  const trackDuration = useGlobalStore((state) => state.duration);

  // Local state for slider
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for smooth animation without re-renders
  const currentPositionRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  // Track the last value from onValueChange so we can use it as a fallback
  // when onValueCommit gets swallowed by React batching (quick clicks)
  const pendingSeekRef = useRef<number | null>(null);

  // Sync with currentTime when paused or changed externally
  useEffect(() => {
    if (!isPlaying) {
      const newPosition = currentTime;
      currentPositionRef.current = newPosition;
      // Use queueMicrotask to avoid synchronous setState in effect body
      queueMicrotask(() => {
        setSliderPosition(newPosition);
      });
    }
  }, [currentTime, isPlaying]);

  // Smooth position updates using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) return;

    let lastUpdateTime = performance.now();

    const animate = () => {
      if (isDragging) {
        // Continue animation but don't update slider
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const currentPosition = getCurrentTrackPosition();
      currentPositionRef.current = currentPosition;

      // Only update React state periodically to reduce re-renders
      // Update every ~250ms for visual feedback, but track internally at 60fps
      const now = performance.now();
      if (now - lastUpdateTime > 250) {
        setSliderPosition(currentPosition);
        lastUpdateTime = now;
      }

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
  }, [isPlaying, getCurrentTrackPosition, isDragging]);

  // Handle slider change
  const handleSliderChange = useCallback(
    (value: number[]) => {
      if (!canMutate) return;
      const position = value[0];
      setIsDragging(true);
      setSliderPosition(position);
      pendingSeekRef.current = position;
    },
    [canMutate]
  );

  // Commit the seek — called by onValueCommit or onPointerUp fallback.
  // Guarded by pendingSeekRef to prevent double-fire when both handlers run.
  const commitSeek = useCallback(() => {
    const position = pendingSeekRef.current;
    if (position === null) return;

    pendingSeekRef.current = null;
    setIsDragging(false);
    setSliderPosition(position);
    currentPositionRef.current = position;

    const { isPlaying: currentlyPlaying, broadcastPlay: play } = useGlobalStore.getState();

    if (currentlyPlaying) {
      play(position);
    } else {
      useGlobalStore.setState({ currentTime: position });
    }
  }, []);

  // Handle slider release - seek to that position
  const handleSliderCommit = () => {
    if (!canMutate) return;
    commitSeek();
  };

  // Fallback for when onValueCommit gets swallowed by React batching.
  // Radix compares the controlled `values` prop (stale due to batching) against
  // the value captured at pointerDown — if they match, onValueCommit never fires.
  const handlePointerUp = useCallback(() => {
    commitSeek();
  }, [commitSeek]);

  const handlePlay = () => {
    if (!canMutate) return;
    const state = useGlobalStore.getState();
    if (state.isPlaying) {
      state.broadcastPause();
    } else {
      state.broadcastPlay();
    }
  };

  const handleSkipBack = useCallback(() => {
    if (!canMutate) return;
    if (!isShuffled) {
      skipToPreviousTrack();
    }
  }, [canMutate, skipToPreviousTrack, isShuffled]);

  const handleSkipForward = useCallback(() => {
    if (!canMutate) return;
    skipToNextTrack();
  }, [canMutate, skipToNextTrack]);

  const handleShuffle = () => {
    if (!canMutate) return;
    toggleShuffle();
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if space is pressed and we're not in an input field
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement).isContentEditable
        )
      ) {
        e.preventDefault();
        if (canMutate) {
          handlePlay();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[37rem]">
        <div className="flex items-center justify-center gap-6 mb-2">
          <button
            className={cn(
              "text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200",
              isShuffled && "text-primary-400",
              !canMutate && "opacity-50 cursor-not-allowed"
            )}
            onClick={handleShuffle}
            disabled={audioSourceCount <= 1 || !canMutate}
          >
            <div className="relative">
              <Shuffle className={cn("size-4 relative", isShuffled ? "text-primary-400" : "text-current")} />
              {isShuffled && (
                <div className="absolute w-1 h-1 bg-green-500 rounded-full bottom-0 top-4.5 left-1/2 transform -translate-x-1/2 translate-y-1/2"></div>
              )}
            </div>
          </button>
          <button
            className={cn(
              "text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
              !canMutate && "opacity-50 cursor-not-allowed"
            )}
            onClick={handleSkipBack}
            disabled={isShuffled || audioSourceCount <= 1 || !canMutate}
          >
            <SkipBack className="w-7 h-7 md:w-5 md:h-5 fill-current" />
          </button>
          <button
            className={cn(
              "bg-white text-black rounded-full p-3 md:p-2 hover:scale-105 transition-transform cursor-pointer duration-200 focus:outline-none",
              !canMutate && "opacity-50 cursor-not-allowed"
            )}
            onClick={handlePlay}
            disabled={!canMutate}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 md:w-4 md:h-4 fill-current stroke-1" />
            ) : (
              <Play className="w-5 h-5 md:w-4 md:h-4 fill-current" />
            )}
          </button>
          <button
            className={cn(
              "text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
              !canMutate && "opacity-50 cursor-not-allowed"
            )}
            onClick={handleSkipForward}
            disabled={audioSourceCount <= 1 || !canMutate}
          >
            <SkipForward className="w-7 h-7 md:w-5 md:h-5 fill-current" />
          </button>
          <button className="text-gray-400 hover:text-white transition-colors cursor-default   hover:scale-105 duration-200">
            <div className="relative">
              <Repeat className="w-4 h-4 relative text-primary-400" />
              <div className="absolute w-1 h-1 bg-green-500 rounded-full bottom-0 top-4.5 left-1/2 transform -translate-x-1/2 translate-y-1/2"></div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-0">
          <span className="text-xs text-muted-foreground min-w-11 select-none">{formatTime(sliderPosition)}</span>
          <Slider
            value={[sliderPosition]}
            min={0}
            max={trackDuration || 1} // Prevent max=0 which causes rendering issues
            step={0.01}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            onPointerUp={handlePointerUp}
            disabled={!canMutate || trackDuration <= 0}
            className={cn(!canMutate && "opacity-50")}
          />
          <span className="text-xs text-muted-foreground min-w-11 text-right select-none">
            {trackDuration > 0 ? formatTime(trackDuration) : ""}
          </span>
        </div>
      </div>
    </div>
  );
};
