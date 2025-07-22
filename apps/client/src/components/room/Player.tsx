import { cn, formatTime } from "@/lib/utils";

import { useGlobalStore } from "@/store/global";
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { Slider } from "../ui/slider";

export const Player = () => {
  const posthog = usePostHog();
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const getCurrentTrackPosition = useGlobalStore(
    (state) => state.getCurrentTrackPosition
  );
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioUrl);
  const audioSources = useGlobalStore((state) => state.roomState.audioSources);
  const audioCache = useGlobalStore((state) => state.audioCache);
  const currentTime = useGlobalStore((state) => state.currentTime);
  const skipToNextTrack = useGlobalStore((state) => state.skipToNextTrack);
  const skipToPreviousTrack = useGlobalStore(
    (state) => state.skipToPreviousTrack
  );
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const toggleShuffle = useGlobalStore((state) => state.toggleShuffle);
  const duration = useGlobalStore((state) => state.duration);

  // Local state for slider
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Check if current track is loaded
  const isCurrentTrackLoaded = selectedAudioId
    ? audioCache.has(selectedAudioId)
    : false;

  // Reset slider position when track changes
  useEffect(() => {
    if (selectedAudioId) {
      setSliderPosition(0);
    }
  }, [selectedAudioId]);

  // Sync with currentTime when it changes (e.g., after pausing)
  useEffect(() => {
    if (!isPlaying) {
      setSliderPosition(currentTime);
    }
  }, [currentTime, isPlaying]);

  // Update slider position during playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!isDragging) {
        const currentPosition = getCurrentTrackPosition();
        setSliderPosition(currentPosition);
      }
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, [isPlaying, getCurrentTrackPosition, isDragging]);

  // Handle slider change
  const handleSliderChange = useCallback((value: number[]) => {
    const position = value[0];
    setIsDragging(true);
    setSliderPosition(position);
  }, []);

  // Handle slider release - seek to that position
  const handleSliderCommit = useCallback(
    (value: number[]) => {
      const newPosition = value[0];
      setIsDragging(false);
      // If currently playing, broadcast play at new position
      // If paused, just update position without playing
      if (isPlaying) {
        broadcastPlay(newPosition);
      } else {
        setSliderPosition(newPosition);
      }

      // Log scrub event
      posthog.capture("scrub_confirm", {
        position: newPosition,
        track_id: selectedAudioId,
        track_duration: duration,
      });
    },
    [
      broadcastPlay,
      isPlaying,
      setSliderPosition,
      posthog,
      selectedAudioId,
      duration,
    ]
  );

  const handlePlay = useCallback(() => {
    // Don't allow play if track isn't loaded
    if (!isCurrentTrackLoaded) {
      return;
    }

    if (isPlaying) {
      broadcastPause();
      posthog.capture("pause_track", { track_id: selectedAudioId });
    } else {
      broadcastPlay(sliderPosition);
      posthog.capture("play_track", {
        position: sliderPosition,
        track_id: selectedAudioId,
      });
    }
  }, [
    isPlaying,
    broadcastPause,
    broadcastPlay,
    sliderPosition,
    posthog,
    selectedAudioId,
    isCurrentTrackLoaded,
  ]);

  const handleSkipBack = useCallback(() => {
    if (!isShuffled) {
      skipToPreviousTrack();
      posthog.capture("skip_previous", {
        from_track_id: selectedAudioId,
      });
    }
  }, [skipToPreviousTrack, isShuffled, posthog, selectedAudioId]);

  const handleSkipForward = useCallback(() => {
    skipToNextTrack();
    posthog.capture("skip_next", {
      from_track_id: selectedAudioId,
    });
  }, [skipToNextTrack, posthog, selectedAudioId]);

  const handleShuffle = useCallback(() => {
    toggleShuffle();
    posthog.capture("toggle_shuffle", {
      shuffle_enabled: !isShuffled,
      queue_size: audioSources.length,
    });
  }, [toggleShuffle, posthog, isShuffled, audioSources.length]);

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
        handlePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlePlay]);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[37rem]">
        <div className="flex items-center justify-center gap-6 mb-2">
          <button
            className={cn(
              "text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200",
              isShuffled && "text-primary-400"
            )}
            onClick={handleShuffle}
            disabled={audioSources.length <= 1}
          >
            <div className="relative">
              <Shuffle
                className={cn(
                  "size-4 relative",
                  isShuffled ? "text-primary-400" : "text-current"
                )}
              />
              {isShuffled && (
                <div className="absolute w-1 h-1 bg-green-500 rounded-full bottom-0 top-4.5 left-1/2 transform -translate-x-1/2 translate-y-1/2"></div>
              )}
            </div>
          </button>
          <button
            className="text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSkipBack}
            disabled={isShuffled || audioSources.length <= 1}
          >
            <SkipBack className="w-7 h-7 md:w-5 md:h-5 fill-current" />
          </button>
          <button
            className={cn(
              "bg-white text-black rounded-full p-3 md:p-2 hover:scale-105 transition-transform cursor-pointer duration-200 focus:outline-none",
              !isCurrentTrackLoaded &&
                "opacity-50 cursor-not-allowed hover:scale-100"
            )}
            onClick={handlePlay}
            disabled={!isCurrentTrackLoaded}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 md:w-4 md:h-4 fill-current stroke-1" />
            ) : (
              <Play className="w-5 h-5 md:w-4 md:h-4 fill-current" />
            )}
          </button>
          <button
            className="text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSkipForward}
            disabled={audioSources.length <= 1}
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
          <span className="text-xs text-muted-foreground min-w-11 select-none">
            {isCurrentTrackLoaded ? formatTime(sliderPosition) : "--:--"}
          </span>
          <Slider
            value={[sliderPosition]}
            min={0}
            max={duration}
            step={0.1}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            disabled={!isCurrentTrackLoaded}
          />
          <span className="text-xs text-muted-foreground min-w-11 text-right select-none">
            {isCurrentTrackLoaded ? formatTime(duration) : "--:--"}
          </span>
        </div>
      </div>
    </div>
  );
};
