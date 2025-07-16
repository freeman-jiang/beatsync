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
import { sendWSRequest } from "@/utils/ws";

export const Player = ({ selectedAppleMusicTrack }: { selectedAppleMusicTrack?: any }) => {
  const posthog = usePostHog();
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const getCurrentTrackPosition = useGlobalStore(
    (state) => state.getCurrentTrackPosition
  );
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioUrl);
  const audioSources = useGlobalStore((state) => state.audioSources);
  const currentTime = useGlobalStore((state) => state.currentTime);
  const skipToNextTrack = useGlobalStore((state) => state.skipToNextTrack);
  const skipToPreviousTrack = useGlobalStore(
    (state) => state.skipToPreviousTrack
  );
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const toggleShuffle = useGlobalStore((state) => state.toggleShuffle);
  const socket = useGlobalStore((state) => state.socket);

  // Local state for slider
  const [sliderPosition, setSliderPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const getAudioDuration = useGlobalStore((state) => state.getAudioDuration);

  // Find the selected audio source and its duration
  useEffect(() => {
    if (!selectedAudioId) return;

    const audioSource = audioSources.find(
      (source) => source.url === selectedAudioId
    );
    if (audioSource) {
      setTrackDuration(getAudioDuration({ url: audioSource.url }));
      // Reset slider position when track changes
      setSliderPosition(0);
    }
  }, [selectedAudioId, audioSources, getAudioDuration]);

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
        track_duration: trackDuration,
      });
    },
    [
      broadcastPlay,
      isPlaying,
      setSliderPosition,
      posthog,
      selectedAudioId,
      trackDuration,
    ]
  );

  const handlePlay = useCallback(() => {
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

  // Helper to send Apple Music sync message
  const sendAppleMusicSync = useCallback((action: "play" | "pause") => {
    if (!socket || !selectedAppleMusicTrack) return;
    const musicKit = (window as any).MusicKit?.getInstance?.();
    if (!musicKit) return;
    const position = musicKit.player.currentPlaybackTime || 0;
    const trackId = selectedAppleMusicTrack.attributes?.playParams?.id;
    if (!trackId) return;
    if (action === "play") {
      sendWSRequest({
        ws: socket,
        request: {
          type: "PLAY",
          sourceType: "appleMusic",
          appleMusicTrackId: trackId,
          appleMusicPosition: position,
          audioId: trackId,
          trackTimeSeconds: position,
        },
      });
    } else if (action === "pause") {
      sendWSRequest({
        ws: socket,
        request: {
          type: "PAUSE",
        },
      });
    }
  }, [socket, selectedAppleMusicTrack]);

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

  // Apple Music playback logic
  useEffect(() => {
    if (!selectedAppleMusicTrack) return;
    // Play the selected Apple Music track using MusicKit JS
    const musicKit = (window as any).MusicKit?.getInstance?.();
    if (musicKit && selectedAppleMusicTrack.attributes?.playParams?.id) {
      musicKit.setQueue({ song: selectedAppleMusicTrack.attributes.playParams.id })
        .then(() => musicKit.play())
        .catch((err: any) => console.error("Apple MusicKit play error:", err));
    }
  }, [selectedAppleMusicTrack]);

  if (selectedAppleMusicTrack) {
    return (
      <div className="w-full flex flex-col items-center justify-center">
        <div className="flex items-center gap-4 mb-2">
          <img
            src={selectedAppleMusicTrack.attributes.artwork.url.replace('{w}x{h}bb', '100x100bb')}
            alt={selectedAppleMusicTrack.attributes.name}
            className="w-16 h-16 rounded object-cover"
          />
          <div>
            <div className="font-semibold text-lg">{selectedAppleMusicTrack.attributes.name}</div>
            <div className="text-sm text-neutral-300">{selectedAppleMusicTrack.attributes.artistName}</div>
            <div className="text-xs text-neutral-400">Album: {selectedAppleMusicTrack.attributes.albumName}</div>
          </div>
        </div>
        <button
          className="px-4 py-2 rounded bg-[#FA2A55] text-white font-medium hover:bg-[#fa2a55cc] transition-colors"
          onClick={() => {
            const musicKit = (window as any).MusicKit?.getInstance?.();
            if (musicKit) {
              if (musicKit.player.isPlaying) {
                musicKit.pause();
                sendAppleMusicSync("pause");
              } else {
                musicKit.play();
                sendAppleMusicSync("play");
              }
            }
          }}
        >
          Play/Pause
        </button>
      </div>
    );
  }

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
            className="bg-white text-black rounded-full p-3 md:p-2 hover:scale-105 transition-transform cursor-pointer duration-200 focus:outline-none"
            onClick={handlePlay}
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
            {formatTime(sliderPosition)}
          </span>
          <Slider
            value={[sliderPosition]}
            min={0}
            max={trackDuration}
            step={0.1}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
          />
          <span className="text-xs text-muted-foreground min-w-11 text-right select-none">
            {formatTime(trackDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
