"use client";

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Clock, Play, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import * as React from "react";
import { toast } from "sonner";

interface SearchResultsProps {
  className?: string;
}

export function SearchResults({ className }: SearchResultsProps) {
  const searchResults = useGlobalStore((state) => state.searchResults);
  const isSearching = useGlobalStore((state) => state.isSearching);
  const searchQuery = useGlobalStore((state) => state.searchQuery);
  const socket = useGlobalStore((state) => state.socket);

  const handleAddTrack = async (track: { id: number; title: string }) => {
    if (!socket) {
      toast.error("Not connected to server");
      return;
    }

    try {
      // Request stream URL for this track
      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.STREAM_MUSIC,
          trackId: track.id,
        },
      });
      
      toast.success(`Adding "${track.title}" to queue...`);
    } catch (error) {
      console.error("Failed to add track:", error);
      toast.error("Failed to add track to queue");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isSearching) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center py-12"
      >
        <div className="flex items-center space-x-3 text-neutral-400">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-5 w-5 border-2 border-neutral-600 border-t-white rounded-full"
          />
          <span>Searching for music...</span>
        </div>
      </motion.div>
    );
  }

  if (!searchResults || !searchResults.data.tracks.items.length) {
    if (searchQuery) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 text-neutral-400"
        >
          <div className="mb-4 text-4xl">🎵</div>
          <h3 className="text-lg font-medium mb-2">No results found</h3>
          <p className="text-sm">
            Try searching for a different artist, song, or album
          </p>
        </motion.div>
      );
    }
    return null;
  }

  const tracks = searchResults.data.tracks.items;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-1">
          Search Results
        </h3>
        <p className="text-sm text-neutral-400">
          Found {searchResults.data.tracks.total} tracks for &quot;{searchQuery}&quot;
        </p>
      </div>

      <AnimatePresence>
        <div className="space-y-2">
          {tracks.map((track, index) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                delay: index * 0.05,
                ease: "easeOut" 
              }}
              className="group bg-neutral-900/50 hover:bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600/50 rounded-lg p-4 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center space-x-4">
                {/* Album Art */}
                <div className="relative flex-shrink-0">
                  <Image
                    src={track.album.image.thumbnail || track.album.image.small}
                    alt={track.album.title}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-md object-cover bg-neutral-800"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23404040'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23888' font-size='14'%3E♪%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-md transition-opacity duration-200">
                    <Play className="h-4 w-4 text-white" />
                  </div>
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-white truncate group-hover:text-white transition-colors">
                    {track.title}
                    {track.version && (
                      <span className="text-neutral-400 font-normal ml-1">
                        ({track.version})
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-neutral-400 truncate">
                    {track.performer.name}
                    {track.composer && track.composer.name !== track.performer.name && (
                      <span className="ml-1">• {track.composer.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {track.album.title}
                    {track.album.released_at && (
                      <span className="ml-1">
                        • {new Date(track.album.released_at * 1000).getFullYear()}
                      </span>
                    )}
                  </p>
                </div>

                {/* Track Duration */}
                <div className="flex items-center space-x-3 text-neutral-400">
                  <div className="flex items-center space-x-1 text-xs">
                    <Clock className="h-3 w-3" />
                    <span>{formatTime(track.duration)}</span>
                  </div>
                  
                  {/* Add Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddTrack(track);
                    }}
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 hover:bg-neutral-700/50 hover:text-white transition-all duration-200"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Additional metadata on hover */}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: { duration: 0.2 }
                }}
                className="mt-3 pt-3 border-t border-neutral-700/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <div className="flex items-center space-x-4">
                    {track.album.genre && (
                      <span className="px-2 py-1 bg-neutral-800/50 rounded-full">
                        {track.album.genre.name}
                      </span>
                    )}
                    <span>Track #{track.track_number}</span>
                    {track.parental_warning && (
                      <span className="text-yellow-500">Explicit</span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-600">
                    ID: {track.id}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>

      {/* Load More (if there are more results) */}
      {searchResults.data.tracks.total > tracks.length && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center"
        >
          <Button
            variant="outline"
            className="bg-neutral-800/30 border-neutral-700/50 hover:bg-neutral-800/50 hover:border-neutral-600"
          >
            Load More Results
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}