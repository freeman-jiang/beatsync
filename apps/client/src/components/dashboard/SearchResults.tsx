"use client";

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, TrackType } from "@beatsync/shared";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { toast } from "sonner";

interface SearchResultsProps {
  className?: string;
  onTrackSelect?: () => void;
}

export function SearchResults({
  className,
  onTrackSelect,
}: SearchResultsProps) {
  const searchResults = useGlobalStore((state) => state.searchResults);
  const isSearching = useGlobalStore((state) => state.isSearching);
  const searchQuery = useGlobalStore((state) => state.searchQuery);
  const socket = useGlobalStore((state) => state.socket);

  // Helper function to format track name as "Artist 1, Artist 2 - Title"
  const formatTrackName = (track: TrackType) => {
    const artists: string[] = [];

    // Add main performer
    if (track.performer?.name) {
      artists.push(track.performer.name);
    }

    // Add album artists if different from performer
    if (track.album?.artists) {
      track.album.artists.forEach((artist) => {
        if (artist.name && !artists.includes(artist.name)) {
          artists.push(artist.name);
        }
      });
    }

    const artistStr =
      artists.length > 0 ? artists.join(", ") : "Unknown Artist";
    const title = track.title || "Unknown Title";

    return `${artistStr} - ${title}`;
  };

  const handleAddTrack = async (track: TrackType) => {
    if (!socket) {
      toast.error("Not connected to server");
      return;
    }

    try {
      const formattedTrackName = formatTrackName(track);

      // Request stream URL for this track
      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.STREAM_MUSIC,
          trackId: track.id,
          trackName: formattedTrackName,
        },
      });

      // Call the callback to handle UI dismissal
      onTrackSelect?.();

      // toast.success(`Adding "${formattedTrackName}" to queue...`);
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
        className="flex flex-col items-center justify-center py-8"
      >
        <div className="size-6 mb-4 relative">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-neutral-800"
            />

            {/* Animated progress circle */}
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              className="text-white"
              strokeDasharray={2 * Math.PI * 42}
              animate={{
                strokeDashoffset: [2 * Math.PI * 42, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                transformOrigin: "center",
                transform: "rotate(-90deg)",
              }}
            />
          </svg>
        </div>

        <motion.h3
          className="text-base font-medium tracking-tight mb-1 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Searching for music...
        </motion.h3>

        <motion.p
          className="text-neutral-400 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          Finding tracks that match your query
        </motion.p>
      </motion.div>
    );
  }

  // Handle error state
  if (searchResults && searchResults.type === "error") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-8"
      >
        <motion.h3
          className="text-base font-medium tracking-tight mb-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          💀
        </motion.h3>

        <motion.p
          className="text-neutral-400 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {searchResults.message}
        </motion.p>
      </motion.div>
    );
  }

  if (
    !searchResults ||
    (searchResults.type === "success" &&
      !searchResults.response.data.tracks.items.length)
  ) {
    if (searchQuery) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-8"
        >
          <div className="size-6 mb-4 relative">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-neutral-800"
              />

              {/* Static circle (no animation for no results) */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                className="text-neutral-600"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * 0.75}
                style={{
                  transformOrigin: "center",
                  transform: "rotate(-90deg)",
                }}
              />
            </svg>
          </div>

          <motion.h3
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            No results found
          </motion.h3>

          <motion.p
            className="text-neutral-400 text-center text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            Try searching for a different artist, song, or album
          </motion.p>
        </motion.div>
      );
    }

    // Show initial state when no search has been performed
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-8"
      >
        <motion.h3
          className="text-base font-medium tracking-tight mb-1 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Start typing to search for music...
        </motion.h3>

        <motion.p
          className="text-neutral-400 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          Experimental. Free while in beta.
        </motion.p>
      </motion.div>
    );
  }

  const tracks =
    searchResults.type === "success"
      ? searchResults.response.data.tracks.items
      : [];

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
              className="group hover:bg-neutral-800 px-3 py-2 transition-all duration-200 cursor-pointer flex items-center gap-3 rounded-md"
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
      {searchResults.type === "success" &&
        searchResults.response.data.tracks.total > tracks.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="my-2 px-3"
          >
            <Button
              variant="ghost"
              className="w-full justify-center text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all duration-200 h-8 text-xs font-normal cursor-pointer"
            >
              Show more results
            </Button>
          </motion.div>
        )}
    </motion.div>
  );
}
