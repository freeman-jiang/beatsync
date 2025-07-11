"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { AnimatePresence, motion } from "motion/react";
import { Play, Pause, Youtube, Trash2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { Button } from "../ui/button";

interface YouTubeQueueProps {
  className?: string;
}

export const YouTubeQueue = ({ className, ...rest }: YouTubeQueueProps) => {
  const posthog = usePostHog();
  
  // Global store state
  const youtubeSources = useGlobalStore((state) => state.youtubeSources);
  const selectedYouTubeId = useGlobalStore((state) => state.selectedYouTubeId);
  const isYouTubePlayerReady = useGlobalStore((state) => state.isYouTubePlayerReady);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const setSelectedYouTubeId = useGlobalStore((state) => state.setSelectedYouTubeId);
  const broadcastPlayYouTube = useGlobalStore((state) => state.broadcastPlayYouTube);
  const setYouTubeSources = useGlobalStore((state) => state.setYouTubeSources);

  // Remove the unused playNextVideo function since we moved it to the global store

  const handleItemClick = (videoId: string) => {
    if (videoId === selectedYouTubeId) {
      // If clicking the currently selected video, toggle play/pause
      if (isYouTubePlayerReady) {
        // Note: We'll need to track playing state for YouTube
        // For now, just broadcast play
        broadcastPlayYouTube(0);
        posthog.capture("play_youtube_video", { video_id: videoId });
      }
    } else {
      // Select new video
      posthog.capture("select_youtube_video", {
        video_id: videoId,
        previous_video_id: selectedYouTubeId,
      });
      
      setSelectedYouTubeId(videoId);
      // Auto-play when selecting a new video
      if (isYouTubePlayerReady) {
        broadcastPlayYouTube(0);
      }
    }
  };

  const handleRemove = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the item click
    
    const newSources = youtubeSources.filter(source => source.videoId !== videoId);
    setYouTubeSources(newSources);
    
    // If we removed the currently selected video, clear selection
    if (videoId === selectedYouTubeId) {
      setSelectedYouTubeId("");
    }
    
    posthog.capture("remove_youtube_video", {
      video_id: videoId,
    });
  };

  if (youtubeSources.length === 0) {
    return (
      <div className={cn("text-center py-8", className)} {...rest}>
        <Youtube className="h-12 w-12 text-neutral-600 mx-auto mb-4" />
        <p className="text-neutral-500 text-sm">No YouTube videos added yet</p>
        <p className="text-neutral-600 text-xs mt-2">
          Add a YouTube URL above to get started
        </p>
      </div>
    );
  }

  return (
    <div className={cn("", className)} {...rest}>
      <div className="space-y-1">
        <AnimatePresence initial={true}>
          {youtubeSources.map((source, index) => {
            const isSelected = source.videoId === selectedYouTubeId;
            const isPlayingThis = isSelected && isPlaying;

            return (
              <motion.div
                key={source.videoId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  duration: 0.4,
                  delay: 0.05 * index,
                  ease: "easeOut",
                }}
                className={cn(
                  "group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 select-none",
                  isSelected
                    ? "bg-red-600/20 border border-red-600/30 shadow-sm"
                    : "bg-neutral-800/30 hover:bg-neutral-800/50 border border-transparent"
                )}
                onClick={() => handleItemClick(source.videoId)}
              >
                {/* Play/Pause Icon */}
                <div className="flex-shrink-0">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    isSelected 
                      ? "bg-red-600 text-white" 
                      : "bg-red-600/80 text-white group-hover:bg-red-600"
                  )}>
                    {isPlayingThis ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </div>
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Youtube className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <h3 className={cn(
                      "font-medium text-sm truncate",
                      isSelected ? "text-white" : "text-neutral-300"
                    )}>
                      {source.title}
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 truncate">
                    Video ID: {source.videoId}
                  </p>
                  <p className="text-xs text-neutral-600">
                    Added by {source.addedBy}
                  </p>
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-400 hover:bg-red-400/10 p-2"
                  onClick={(e) => handleRemove(source.videoId, e)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>

                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-red-500 rounded-r-full" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
