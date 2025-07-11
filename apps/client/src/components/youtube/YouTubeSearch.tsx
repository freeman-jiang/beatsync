"use client";

import { useState } from "react";
import { Search, Play, Plus, Grid, List, Eye } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { useGlobalStore } from "@/store/global";
import Image from "next/image";

interface SearchResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  publishedAt: string;
}

interface YouTubeSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: {
    message: string;
  };
}

export const YouTubeSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState<string | null>(null);
  
  const addYouTubeSource = useGlobalStore((state) => state.addYouTubeSource);
  const setSelectedYouTubeId = useGlobalStore((state) => state.setSelectedYouTubeId);

  // YouTube search function
  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
        q: query,
        part: 'snippet',
        type: 'video',
        videoCategoryId: '10', // Music category
        key: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY!, // 🔐 consider hiding in .env + API proxy
        maxResults: '10',
      }));
      
      const data: YouTubeSearchResponse = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'YouTube API Error');
      }

      // Transform YouTube API response to our SearchResult format
      const transformedResults: SearchResult[] = data.items?.map((item: YouTubeSearchItem) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        duration: 'N/A', // YouTube Search API doesn't provide duration, would need additional API call
        viewCount: 'N/A', // YouTube Search API doesn't provide view count, would need additional API call
        publishedAt: new Date(item.snippet.publishedAt).toLocaleDateString(),
      })) || [];

      setResults(transformedResults);
    } catch (error) {
      console.error('YouTube API Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to search YouTube videos');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  const handlePlay = (video: SearchResult) => {
    addYouTubeSource({
      videoId: video.id,
      title: video.title,
      channel: video.channelTitle,
      duration: video.duration,
      thumbnail: video.thumbnail
    });
    setSelectedYouTubeId(video.id);
  };

  const handleAddToQueue = (video: SearchResult) => {
    addYouTubeSource({
      videoId: video.id,
      title: video.title,
      channel: video.channelTitle,
      duration: video.duration,
      thumbnail: video.thumbnail
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
          <Input
            placeholder="Search YouTube videos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10 bg-neutral-800/50 border-neutral-700 text-white placeholder:text-neutral-500"
          />
        </div>
        <Button 
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="px-4"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* View Mode Toggle */}
      {results.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">View:</span>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-8 px-3"
          >
            <Grid className="h-3 w-3" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8 px-3"
          >
            <List className="h-3 w-3" />
          </Button>
          <span className="text-sm text-neutral-500 ml-auto">
            {results.length} results
          </span>
        </div>
      )}

      {/* Results */}
      <div className={viewMode === 'grid' 
        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
        : "space-y-2"
      }>
        {results.map((video) => (
          <Card key={video.id} className="bg-neutral-800/30 border-neutral-700/50 hover:bg-neutral-800/50 transition-colors group">
            <CardContent className={viewMode === 'grid' ? "p-3" : "p-3"}>
              {viewMode === 'grid' ? (
                <div className="space-y-3">
                  {/* Thumbnail */}
                  <div className="relative">
                    <Image
                      src={video.thumbnail}
                      alt={video.title}
                      width={320}
                      height={180}
                      className="w-full h-32 object-cover rounded-md"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                      <Button
                        onClick={() => handlePlay(video)}
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white mr-2"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleAddToQueue(video)}
                        size="sm"
                        variant="secondary"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                      {video.duration}
                    </div>
                  </div>
                  
                  {/* Video Info */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight">
                      {video.title}
                    </h3>
                    <p className="text-xs text-neutral-400">{video.channelTitle}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {video.viewCount}
                      </span>
                      <span>•</span>
                      <span>{video.publishedAt}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  <div className="relative flex-shrink-0">
                    <Image
                      src={video.thumbnail}
                      alt={video.title}
                      width={80}
                      height={56}
                      className="w-20 h-14 object-cover rounded-md"
                    />
                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                      {video.duration}
                    </div>
                  </div>
                  
                  {/* Video Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight mb-1">
                      {video.title}
                    </h3>
                    <p className="text-xs text-neutral-400 mb-1">{video.channelTitle}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {video.viewCount}
                      </span>
                      <span>•</span>
                      <span>{video.publishedAt}</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      onClick={() => handlePlay(video)}
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white h-8 px-3"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      onClick={() => handleAddToQueue(video)}
                      size="sm"
                      variant="secondary"
                      className="h-8 px-3"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {results.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">Search for YouTube videos to add to your queue</p>
        </div>
      )}
    </div>
  );
};

