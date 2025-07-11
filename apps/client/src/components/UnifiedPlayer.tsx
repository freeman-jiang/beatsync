"use client";

import { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Repeat, 
  Shuffle, 
  Maximize2, 
  Minimize2,
  Youtube,
  Music
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { useGlobalStore } from "@/store/global";
import { Card } from "./ui/card";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { YouTubePlayer } from "./youtube/YouTubePlayer";

export const UnifiedPlayer = () => {
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const [localVolume, setLocalVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [livePosition, setLivePosition] = useState(0);
  const [youtubeDuration, setYoutubeDuration] = useState(0);
  const [youtubePosition, setYoutubePosition] = useState(0);
  
  // Global state
  const currentMode = useGlobalStore((state) => state.currentMode);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const repeatMode = useGlobalStore((state) => state.repeatMode);
  const isInitingSystem = useGlobalStore((state) => state.isInitingSystem);
  
  // YouTube state
  const selectedYouTubeId = useGlobalStore((state) => state.selectedYouTubeId);
  const youtubeSources = useGlobalStore((state) => state.youtubeSources);
  const youtubePlayer = useGlobalStore((state) => state.youtubePlayer);
  const isYouTubePlayerReady = useGlobalStore((state) => state.isYouTubePlayerReady);
  
  // Library state
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioId);
  const audioSources = useGlobalStore((state) => state.audioSources);
  const currentTime = useGlobalStore((state) => state.currentTime);
  const duration = useGlobalStore((state) => state.duration);
  const getCurrentTrackPosition = useGlobalStore((state) => state.getCurrentTrackPosition);
  
  // Actions
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const skipToNextTrack = useGlobalStore((state) => state.skipToNextTrack);
  const skipToPreviousTrack = useGlobalStore((state) => state.skipToPreviousTrack);
  const broadcastPlayYouTube = useGlobalStore((state) => state.broadcastPlayYouTube);
  const broadcastPauseYouTube = useGlobalStore((state) => state.broadcastPauseYouTube);
  const skipToNextYouTubeVideo = useGlobalStore((state) => state.skipToNextYouTubeVideo);
  const skipToPreviousYouTubeVideo = useGlobalStore((state) => state.skipToPreviousYouTubeVideo);
  const broadcastSeekYouTube = useGlobalStore((state) => state.broadcastSeekYouTube);
  const setIsShuffled = useGlobalStore((state) => state.setIsShuffled);
  const setRepeatMode = useGlobalStore((state) => state.setRepeatMode);
  const setVolume = useGlobalStore((state) => state.setVolume);
  const getVolume = useGlobalStore((state) => state.getVolume);

  // Get current content info
  const currentVideo = youtubeSources.find(source => source.videoId === selectedYouTubeId);
  const currentAudio = audioSources.find(source => source.id === selectedAudioId);

  // Helper function to format time
  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Update live position for both library and YouTube modes
  useEffect(() => {
    if (currentMode === 'library' && isPlaying) {
      const interval = setInterval(() => {
        const position = getCurrentTrackPosition();
        setLivePosition(position);
      }, 100); // Update every 100ms for smooth progress

      return () => clearInterval(interval);
    } else if (currentMode === 'youtube' && isPlaying && youtubePlayer) {
      const interval = setInterval(() => {
        try {
          const currentTime = youtubePlayer.getCurrentTime();
          const duration = youtubePlayer.getDuration();
          setYoutubePosition(currentTime);
          setYoutubeDuration(duration);
        } catch {
          // YouTube player might not be ready yet
          console.log("YouTube player not ready for time tracking");
        }
      }, 100); // Update every 100ms for smooth progress

      return () => clearInterval(interval);
    } else {
      setLivePosition(currentTime);
      if (currentMode === 'youtube') {
        setYoutubePosition(0);
      }
    }
  }, [currentMode, isPlaying, getCurrentTrackPosition, currentTime, youtubePlayer]);

  // Player controls
  const handlePlayPause = () => {
    console.log("UnifiedPlayer: Play/Pause clicked", { 
      currentMode, 
      isPlaying, 
      selectedAudioId, 
      currentAudio: !!currentAudio,
      isInitingSystem,
      audioSourcesLength: audioSources.length 
    });
    
    if (isInitingSystem) {
      console.log("UnifiedPlayer: System still initializing, cannot play");
      return;
    }
    
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      if (isPlaying) {
        // Pause the YouTube player directly
        youtubePlayer.pauseVideo();
        // Also broadcast the pause to other clients
        broadcastPauseYouTube();
      } else {
        // Play the YouTube player directly
        youtubePlayer.playVideo();
        // Also broadcast the play to other clients
        const currentTime = youtubePlayer.getCurrentTime();
        broadcastPlayYouTube(currentTime);
      }
    } else if (currentMode === 'library') {
      if (isPlaying) {
        console.log("UnifiedPlayer: Broadcasting pause");
        broadcastPause();
      } else {
        console.log("UnifiedPlayer: Broadcasting play");
        broadcastPlay();
      }
    }
  };

  const handlePrevious = () => {
    if (currentMode === 'youtube') {
      skipToPreviousYouTubeVideo();
    } else if (currentMode === 'library') {
      skipToPreviousTrack();
    }
  };

  const handleNext = () => {
    if (currentMode === 'youtube') {
      skipToNextYouTubeVideo();
    } else if (currentMode === 'library') {
      skipToNextTrack();
    }
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setLocalVolume(vol);
    setIsMuted(vol === 0);
    
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      youtubePlayer.setVolume(vol);
    } else if (currentMode === 'library') {
      // Set the actual audio volume using the global store
      setVolume(vol);
    }
  };

  const handleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
        youtubePlayer.setVolume(localVolume);
      } else if (currentMode === 'library') {
        setVolume(localVolume);
      }
    } else {
      setIsMuted(true);
      if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
        youtubePlayer.setVolume(0);
      } else if (currentMode === 'library') {
        setVolume(0);
      }
    }
  };

  const handleShuffle = () => {
    setIsShuffled(!isShuffled);
  };

  const handleRepeat = () => {
    const modes = ['none', 'all', 'one'] as const;
    const currentIndex = modes.indexOf(repeatMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setRepeatMode(modes[nextIndex]);
  };

  const handleProgressChange = (newValue: number[]) => {
    const percentage = newValue[0];
    
    if (currentMode === 'youtube' && youtubeDuration > 0) {
      const newTime = (percentage / 100) * youtubeDuration;
      if (youtubePlayer && isYouTubePlayerReady) {
        youtubePlayer.seekTo(newTime, true);
        broadcastSeekYouTube(newTime);
      }
    } else if (currentMode === 'library' && duration > 0) {
      // Calculate the target time from percentage
      const newTime = (percentage / 100) * duration;
      console.log(`Library seeking to ${newTime}s (${percentage}%)`);
      
      // Use broadcastPlay with the new time to seek in library mode
      broadcastPlay(newTime);
    }
  };

  // Set initial volume when YouTube player is ready
  useEffect(() => {
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      youtubePlayer.setVolume(isMuted ? 0 : localVolume);
    }
  }, [youtubePlayer, isYouTubePlayerReady, localVolume, isMuted, currentMode]);

  // Initialize local volume from global store
  useEffect(() => {
    const currentVolume = getVolume();
    setLocalVolume(currentVolume);
  }, [getVolume]);

  return (
    <Card className="bg-neutral-900/80 backdrop-blur-xl border-neutral-800/50">
      <div className="p-4">
        {/* Video Display (YouTube Mode Only) */}
        <AnimatePresence>
          {currentMode === 'youtube' && selectedYouTubeId && isVideoExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ 
                opacity: 1, 
                height: 400 
              }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="mb-4 relative overflow-hidden rounded-lg bg-black group"
            >
              <div className="w-full h-full transition-all duration-300 ease-in-out min-h-[400px]">
                <YouTubePlayer 
                  videoId={selectedYouTubeId}
                  className="w-full h-full"
                />
              </div>
              
              {/* Video Overlay Controls */}
              <div className="absolute top-2 right-2 flex gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  onClick={() => setIsVideoExpanded(!isVideoExpanded)}
                  size="sm"
                  variant="secondary"
                  className="bg-black/60 hover:bg-black/80 backdrop-blur-sm"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Layout */}
        <div className={`flex ${isVideoExpanded ? 'flex-col' : 'items-center gap-4'}`}>
          {/* Video Thumbnail/Player (Minimized) */}
          {currentMode === 'youtube' && selectedYouTubeId && !isVideoExpanded && (
            <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-black flex-shrink-0 group">
              <YouTubePlayer 
                videoId={selectedYouTubeId}
                className="w-full h-full"
              />
              <Button
                onClick={() => setIsVideoExpanded(true)}
                size="sm"
                variant="secondary"
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Track Info and Controls Container */}
          <div className="flex-1 space-y-3">
            {/* Track Info */}
            <div className="flex items-center gap-3">
              {!isVideoExpanded && (
                <>
                  {currentMode === 'youtube' && currentVideo ? (
                    <>
                      {currentVideo.thumbnail && !selectedYouTubeId && (
                        <div className="w-12 h-12 rounded-md overflow-hidden bg-neutral-800 flex-shrink-0">
                          <Image
                            src={currentVideo.thumbnail}
                            alt={currentVideo.title}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium text-sm line-clamp-1">
                          {currentVideo.title}
                        </h3>
                        <p className="text-neutral-400 text-xs">
                          {currentVideo.channel}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-red-500">
                        <Youtube className="h-4 w-4" />
                        <span className="text-xs">YouTube</span>
                      </div>
                    </>
                  ) : currentMode === 'library' && currentAudio ? (
                    <>
                      <div className="w-12 h-12 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Music className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium text-sm line-clamp-1">
                          {currentAudio.name}
                        </h3>
                        <p className="text-neutral-400 text-xs">
                          {isInitingSystem ? 'System initializing...' : isPlaying ? 'Playing' : 'Ready to play'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-blue-500">
                        <Music className="h-4 w-4" />
                        <span className="text-xs">Library</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-md bg-neutral-800 flex items-center justify-center flex-shrink-0">
                        <Music className="h-6 w-6 text-neutral-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium text-sm">
                          {currentMode === 'library' ? 'Select a track' : 'No video selected'}
                        </h3>
                        <p className="text-neutral-400 text-xs">
                          {currentMode === 'library' ? 'Upload music to get started' : 'Search for YouTube videos'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-neutral-500">
                        {currentMode === 'library' ? (
                          <>
                            <Music className="h-4 w-4" />
                            <span className="text-xs">Library</span>
                          </>
                        ) : (
                          <>
                            <Youtube className="h-4 w-4" />
                            <span className="text-xs">YouTube</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Expanded mode track info */}
              {isVideoExpanded && (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {currentVideo?.thumbnail && (
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-neutral-800 flex-shrink-0">
                        <Image
                          src={currentVideo.thumbnail}
                          alt={currentVideo.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium text-sm line-clamp-1">
                        {currentVideo?.title || 'No video selected'}
                      </h3>
                      <p className="text-neutral-400 text-xs">
                        {currentVideo?.channel || 'Search for YouTube videos'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-red-500">
                    <Youtube className="h-4 w-4" />
                    <span className="text-xs">YouTube</span>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="space-y-3">
              {/* Progress Bar */}
              {((currentMode === 'library' && currentAudio) || (currentMode === 'youtube' && currentVideo)) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400 w-12 text-left">
                      {currentMode === 'library' 
                        ? formatTime(livePosition) 
                        : formatTime(youtubePosition)
                      }
                    </span>
                    <div className="flex-1">
                      <Slider
                        value={[
                          currentMode === 'library' 
                            ? (duration > 0 ? (livePosition / duration) * 100 : 0)
                            : (youtubeDuration > 0 ? (youtubePosition / youtubeDuration) * 100 : 0)
                        ]}
                        onValueChange={handleProgressChange}
                        max={100}
                        step={0.1}
                        className="w-full cursor-pointer"
                      />
                    </div>
                    <span className="text-xs text-neutral-400 w-12 text-right">
                      {currentMode === 'library' 
                        ? formatTime(duration) 
                        : formatTime(youtubeDuration)
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Primary Controls */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleShuffle}
                    variant={isShuffled ? "default" : "ghost"}
                    size="sm"
                    className="text-neutral-400 hover:text-white"
                    disabled={
                      (currentMode === 'library' && audioSources.length <= 1)
                    }
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>

                  <Button
                    onClick={handlePrevious}
                    variant="ghost"
                    size="sm"
                    className="text-neutral-400 hover:text-white"
                    disabled={
                      (currentMode === 'youtube' && youtubeSources.length === 0) ||
                      (currentMode === 'library' && audioSources.length <= 1)
                    }
                  >
                    <SkipBack className="h-5 w-5" />
                  </Button>

                  <Button
                    onClick={handlePlayPause}
                    className="bg-white text-black hover:bg-neutral-200 w-12 h-12 rounded-full"
                    disabled={
                      isInitingSystem ||
                      (currentMode === 'youtube' && (!selectedYouTubeId || !isYouTubePlayerReady)) ||
                      (currentMode === 'library' && (!selectedAudioId || audioSources.length === 0))
                    }
                  >
                    {isPlaying ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6 ml-0.5" />
                    )}
                  </Button>

                  <Button
                    onClick={handleNext}
                    variant="ghost"
                    size="sm"
                    className="text-neutral-400 hover:text-white"
                    disabled={
                      (currentMode === 'youtube' && youtubeSources.length === 0) ||
                      (currentMode === 'library' && audioSources.length <= 1)
                    }
                  >
                    <SkipForward className="h-5 w-5" />
                  </Button>

                  <Button
                    onClick={handleRepeat}
                    variant={repeatMode !== 'none' ? "default" : "ghost"}
                    size="sm"
                    className="text-neutral-400 hover:text-white relative"
                  >
                    <Repeat className="h-4 w-4" />
                    {repeatMode === 'one' && (
                      <span className="absolute -top-1 -right-1 text-xs bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                        1
                      </span>
                    )}
                  </Button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-3 w-64">
                  <Button
                    onClick={handleMute}
                    variant="ghost"
                    size="sm"
                    className="text-neutral-400 hover:text-white flex-shrink-0"
                  >
                    {isMuted || localVolume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <div className="flex-1">
                    <Slider
                      value={[isMuted ? 0 : localVolume]}
                      onValueChange={handleVolumeChange}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  
                  <span className="text-xs text-neutral-500 w-8 text-right">
                    {isMuted ? 0 : localVolume}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
