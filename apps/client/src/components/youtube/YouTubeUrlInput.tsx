"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGlobalStore } from "@/store/global";
import { Plus, Youtube } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface YouTubeUrlInputProps {
  className?: string;
}

// Extract video ID and playlist ID from various YouTube URL formats
const extractYouTubeInfo = (url: string): { videoId?: string; playlistId?: string } | null => {
  const videoPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];
  
  const playlistPatterns = [
    /[?&]list=([^&\n?#]+)/,
    /youtube\.com\/playlist\?list=([^&\n?#]+)/,
    /^(PL[a-zA-Z0-9_-]+)$/ // Direct playlist ID
  ];
  
  let videoId: string | undefined;
  let playlistId: string | undefined;
  
  // Check for video ID
  for (const pattern of videoPatterns) {
    const match = url.match(pattern);
    if (match) {
      videoId = match[1];
      break;
    }
  }
  
  // Check for playlist ID
  for (const pattern of playlistPatterns) {
    const match = url.match(pattern);
    if (match) {
      playlistId = match[1];
      break;
    }
  }
  
  if (!videoId && !playlistId) {
    return null;
  }
  
  return { videoId, playlistId };
};

export const YouTubeUrlInput = ({ className }: YouTubeUrlInputProps) => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const addYouTubeSource = useGlobalStore((state) => state.addYouTubeSource);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    const extractedInfo = extractYouTubeInfo(url.trim());
    if (!extractedInfo) {
      toast.error("Invalid YouTube URL. Please enter a valid YouTube video URL, playlist URL, or ID.");
      return;
    }

    setIsLoading(true);
    
    try {
      if (extractedInfo.playlistId) {
        // Handle playlist - for now, show a message that playlists are detected
        toast.success("Playlist detected! Adding first video...");
        // In a real implementation, you'd fetch the playlist videos from YouTube API
        // For now, let's mock adding the first video
        if (extractedInfo.videoId) {
          await addYouTubeSource({
            videoId: extractedInfo.videoId,
            title: `Video from Playlist ${extractedInfo.playlistId}`,
            channel: "YouTube Playlist",
            thumbnail: `https://img.youtube.com/vi/${extractedInfo.videoId}/mqdefault.jpg`
          });
        } else {
          toast.error("Playlist support coming soon! Please add individual videos for now.");
          return;
        }
      } else if (extractedInfo.videoId) {
        // Add individual video
        await addYouTubeSource({
          videoId: extractedInfo.videoId,
          title: `YouTube Video ${extractedInfo.videoId}`,
          channel: "Unknown Channel",
          thumbnail: `https://img.youtube.com/vi/${extractedInfo.videoId}/mqdefault.jpg`
        });
      }
      
      setUrl("");
      toast.success("YouTube video added to queue");
    } catch (error) {
      console.error("Error adding YouTube video:", error);
      toast.error("Failed to add YouTube video");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex gap-2 p-2 border border-neutral-700/50 rounded-md bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors">
        <div className="bg-red-600 text-white p-1.5 rounded-md flex-shrink-0">
          <Youtube className="h-4 w-4" />
        </div>
        <Input
          type="text"
          placeholder="YouTube URL, playlist, or video ID"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
          className="flex-1 bg-transparent border-none text-white placeholder-neutral-400 focus:outline-none focus:ring-0"
        />
        <Button
          type="submit"
          disabled={isLoading || !url.trim()}
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white px-3"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
};
