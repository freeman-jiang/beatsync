"use client";

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
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
      <AnimatePresence>
        <div className="space-y-1">
          {tracks.map((track, index) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                duration: 0.2,
                delay: index * 0.02,
                ease: "easeOut",
              }}
              className="group hover:bg-neutral-800/30 px-3 py-2 transition-all duration-200 cursor-pointer flex items-center gap-3"
              onClick={() => handleAddTrack(track)}
            >
              {/* Album Art */}
              <div className="relative flex-shrink-0">
                <Image
                  src={track.album.image.thumbnail || track.album.image.small}
                  alt={track.album.title}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded object-cover bg-neutral-800"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23404040'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23888' font-size='14'%3E♪%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-normal text-white truncate text-sm">
                  {track.title}
                  {track.version && (
                    <span className="text-neutral-500 ml-1">
                      ({track.version})
                    </span>
                  )}
                </h4>
                <p className="text-xs text-neutral-400 truncate">
                  {track.performer.name}
                </p>
              </div>

              {/* Duration */}
              <div className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">
                {formatTime(track.duration)}
              </div>

              {/* Add Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddTrack(track);
                }}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-neutral-700/50 hover:text-white transition-all duration-200"
              >
                <Plus className="h-3 w-3" />
              </Button>
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
          className="mt-4 px-3"
        >
          <Button
            variant="ghost"
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Show more results
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
