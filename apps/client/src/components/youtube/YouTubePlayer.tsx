"use client";

import { useGlobalStore } from "@/store/global";
import { useCallback, useEffect, useRef, useState } from "react";
import YouTube, { YouTubeProps, YouTubeEvent } from "react-youtube";

interface YouTubePlayerProps {
  videoId?: string;
  className?: string;
}

export const YouTubePlayer = ({ 
  videoId, 
  className = "" 
}: YouTubePlayerProps) => {
  const playerRef = useRef<YouTubeEvent['target'] | null>(null);
  const [playerState, setPlayerState] = useState<number>(-1);
  
  // Global store state and actions
  const selectedYouTubeId = useGlobalStore((state) => state.selectedYouTubeId);
  const isYouTubePlayerReady = useGlobalStore((state) => state.isYouTubePlayerReady);
  const setYouTubePlayerReady = useGlobalStore((state) => state.setYouTubePlayerReady);
  const setYouTubePlayer = useGlobalStore((state) => state.setYouTubePlayer);
  const playNextYouTubeVideo = useGlobalStore((state) => state.playNextYouTubeVideo);

  // Use selectedYouTubeId from store if no videoId prop is provided
  const activeVideoId = videoId || selectedYouTubeId;

  // Player options
  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0, // Controlled programmatically
      controls: 1, // Show YouTube controls for now
      disablekb: 0, // Enable keyboard controls
      fs: 1, // Enable fullscreen
      iv_load_policy: 3, // Hide annotations
      modestbranding: 1, // Minimal YouTube branding
      rel: 0, // Don't show related videos
      showinfo: 0, // Hide video info
      origin: typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_NEXT_URL, // Fix CORS issue
      enablejsapi: 1, // Enable JavaScript API
    },
  };

  // Handle player ready
  const handlePlayerReady = useCallback((event: YouTubeEvent) => {
    console.log("YouTube player ready");
    playerRef.current = event.target;
    setYouTubePlayer(event.target);
    setYouTubePlayerReady(true);
  }, [setYouTubePlayer, setYouTubePlayerReady]);

  // Handle state changes
  const handleStateChange = useCallback((event: YouTubeEvent) => {
    const state = event.data;
    setPlayerState(state);
    
    console.log("YouTube player state changed:", state);
    
    // YouTube player states:
    // -1 (unstarted)
    // 0 (ended)
    // 1 (playing)
    // 2 (paused)
    // 3 (buffering)
    // 5 (video cued)
    
    if (isYouTubePlayerReady && playerRef.current) {
      // Only update isPlaying if this is a user-initiated state change
      // Don't update for programmatic changes (from sync)
      
      // Handle specific state transitions
      switch (state) {
        case 1: // Playing
          console.log("YouTube player is playing");
          // Only update isPlaying if it's not already playing (to avoid sync conflicts)
          const currentIsPlaying = useGlobalStore.getState().isPlaying;
          if (!currentIsPlaying) {
            useGlobalStore.setState({ isPlaying: true });
          }
          break;
        case 2: // Paused
          console.log("YouTube player is paused");
          // Only update isPlaying if it's currently playing (to avoid sync conflicts)
          const currentIsPlayingPause = useGlobalStore.getState().isPlaying;
          if (currentIsPlayingPause) {
            useGlobalStore.setState({ isPlaying: false });
          }
          break;
        case 0: // Ended
          console.log("YouTube video ended, playing next video");
          useGlobalStore.setState({ isPlaying: false });
          playNextYouTubeVideo();
          break;
      }
    }
  }, [isYouTubePlayerReady, playNextYouTubeVideo]);

  // Handle errors
  const handleError = useCallback((event: { data: number; target: YouTubeEvent['target'] }) => {
    console.error("YouTube player error:", event);
  }, []);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        setYouTubePlayer(null);
        setYouTubePlayerReady(false);
      }
    };
  }, [setYouTubePlayer, setYouTubePlayerReady]);

  if (!activeVideoId) {
    return (
      <div className={`w-full h-full bg-neutral-800/30 rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-neutral-400">No YouTube video selected</p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full rounded-lg overflow-hidden bg-black ${className}`}>
      <YouTube
        videoId={activeVideoId}
        opts={opts}
        onReady={handlePlayerReady}
        onStateChange={handleStateChange}
        onError={handleError}
        className="w-full h-full"
        iframeClassName="w-full h-full"
        
      />
      {/* Show player state for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-neutral-500 p-2">
          Player State: {playerState} | Ready: {isYouTubePlayerReady.toString()}
        </div>
      )}
    </div>
  );
};
