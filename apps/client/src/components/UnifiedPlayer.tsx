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

export const UnifiedPlayer = () => {
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  
  const currentMode = useGlobalStore((state) => state.currentMode);
  const selectedYouTubeId = useGlobalStore((state) => state.selectedYouTubeId);
  const youtubeSources = useGlobalStore((state) => state.youtubeSources);
  const youtubePlayer = useGlobalStore((state) => state.youtubePlayer);
  const isYouTubePlayerReady = useGlobalStore((state) => state.isYouTubePlayerReady);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const repeatMode = useGlobalStore((state) => state.repeatMode);
  
  const broadcastPlayYouTube = useGlobalStore((state) => state.broadcastPlayYouTube);
  const broadcastPauseYouTube = useGlobalStore((state) => state.broadcastPauseYouTube);
  const setSelectedYouTubeId = useGlobalStore((state) => state.setSelectedYouTubeId);
  const setIsShuffled = useGlobalStore((state) => state.setIsShuffled);
  const setRepeatMode = useGlobalStore((state) => state.setRepeatMode);

  // Get current video info
  const currentVideo = youtubeSources.find(source => source.videoId === selectedYouTubeId);

  // Player controls
  const handlePlayPause = () => {
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      if (isPlaying) {
        broadcastPauseYouTube();
      } else {
        broadcastPlayYouTube();
      }
    }
    // Add library mode play/pause logic here
  };

  const handlePrevious = () => {
    if (currentMode === 'youtube' && youtubeSources.length > 0) {
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      if (currentIndex > 0) {
        setSelectedYouTubeId(youtubeSources[currentIndex - 1].videoId);
      } else if (youtubeSources.length > 0) {
        // Loop to last video
        setSelectedYouTubeId(youtubeSources[youtubeSources.length - 1].videoId);
      }
    }
    // Add library mode previous logic here
  };

  const handleNext = () => {
    if (currentMode === 'youtube' && youtubeSources.length > 0) {
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      if (currentIndex < youtubeSources.length - 1) {
        setSelectedYouTubeId(youtubeSources[currentIndex + 1].videoId);
      } else if (youtubeSources.length > 0) {
        // Loop to first video
        setSelectedYouTubeId(youtubeSources[0].videoId);
      }
    }
    // Add library mode next logic here
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    setIsMuted(vol === 0);
    
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      youtubePlayer.setVolume(vol);
    }
    // Add library mode volume logic here
  };

  const handleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
        youtubePlayer.setVolume(volume);
      }
    } else {
      setIsMuted(true);
      if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
        youtubePlayer.setVolume(0);
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

  // Set initial volume when YouTube player is ready
  useEffect(() => {
    if (currentMode === 'youtube' && youtubePlayer && isYouTubePlayerReady) {
      youtubePlayer.setVolume(isMuted ? 0 : volume);
    }
  }, [youtubePlayer, isYouTubePlayerReady, volume, isMuted, currentMode]);

  return (
    <Card className="bg-neutral-900/80 backdrop-blur-xl border-neutral-800/50">
      <div className="p-4">
        {/* Video Display (YouTube Mode Only) */}
        <AnimatePresence>
          {currentMode === 'youtube' && selectedYouTubeId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: isVideoExpanded ? 400 : 200 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4 relative overflow-hidden rounded-lg bg-black"
            >
              <div 
                id="youtube-player-mini"
                className="w-full h-full aspect-video"
              />
              
              {/* Video Overlay Controls */}
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  onClick={() => setIsVideoExpanded(!isVideoExpanded)}
                  size="sm"
                  variant="secondary"
                  className="bg-black/60 hover:bg-black/80 backdrop-blur-sm"
                >
                  {isVideoExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              {/* Video Info Overlay */}
              {currentVideo && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <h3 className="text-white font-medium text-sm line-clamp-1">
                    {currentVideo.title}
                  </h3>
                  <p className="text-neutral-300 text-xs">
                    {currentVideo.channel}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Track Info */}
        <div className="flex items-center gap-4 mb-4">
          {currentMode === 'youtube' && currentVideo ? (
            <>
              {currentVideo.thumbnail && (
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
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Primary Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={handleShuffle}
              variant={isShuffled ? "default" : "ghost"}
              size="sm"
              className="text-neutral-400 hover:text-white"
            >
              <Shuffle className="h-4 w-4" />
            </Button>

            <Button
              onClick={handlePrevious}
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              onClick={handlePlayPause}
              className="bg-white text-black hover:bg-neutral-200 w-12 h-12 rounded-full"
              disabled={currentMode === 'youtube' && (!selectedYouTubeId || !isYouTubePlayerReady)}
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
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMute}
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white flex-shrink-0"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            
            <div className="flex-1">
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={handleVolumeChange}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            
            <span className="text-xs text-neutral-500 w-8 text-right">
              {isMuted ? 0 : volume}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
