"use client";

import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Search as SearchIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { SearchResults } from "./SearchResults";

interface SearchForm {
  query: string;
}

export function InlineSearch() {
  const [showResults, setShowResults] = React.useState(false);
  const socket = useGlobalStore((state) => state.socket);
  const setIsSearching = useGlobalStore((state) => state.setIsSearching);
  const setSearchQuery = useGlobalStore((state) => state.setSearchQuery);
  const searchResults = useGlobalStore((state) => state.searchResults);
  const isSearching = useGlobalStore((state) => state.isSearching);
  const { register, handleSubmit, setFocus, watch } = useForm<SearchForm>({
    defaultValues: { query: "" },
  });

  const watchedQuery = watch("query");

  // Add keyboard shortcut for ⌘K to focus input
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setFocus("query");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFocus]);

  // Dismiss search results when input becomes empty
  React.useEffect(() => {
    if (!watchedQuery || watchedQuery.trim() === "") {
      setShowResults(false);
    }
  }, [watchedQuery]);

  const onSubmit = (data: SearchForm) => {
    if (!socket) {
      console.error("WebSocket not connected");
      return;
    }

    console.log("data", data);

    if (!data.query || !data.query.trim()) return;

    console.log("Sending search request", data.query);

    // Set loading state and store query
    setIsSearching(true);
    setSearchQuery(data.query);
    setShowResults(true);

    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.SEARCH_MUSIC,
        query: data.query,
      },
    });
  };

  const handleTrackSelection = () => {
    // Dismiss search results immediately
    setShowResults(false);
  };

  const handleBlur = () => {
    // Dismiss search results when input loses focus
    setShowResults(false);
  };

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="relative group">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 size-5 text-neutral-400 group-focus-within:text-white/80 transition-colors duration-200" />
          <input
            {...register("query")}
            type="text"
            placeholder="What do you want to play?"
            onBlur={handleBlur}
            className="w-full h-10 pl-10 pr-16 bg-white/10 hover:bg-white/15 focus:bg-white/15 border border-neutral-600/30 focus:ring-2 focus:ring-white/80 rounded-lg text-white placeholder:text-neutral-400 text-sm font-normal transition-all duration-200 focus:outline-none"
          />
          <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none inline-flex h-6 items-center gap-0.5 rounded border border-neutral-600/50 bg-neutral-700/50 px-2 font-mono text-xs font-medium text-neutral-400">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </form>

      {/* Beta Disclaimer */}
      <p className="mt-2 text-[10px] font-mono text-neutral-500">
        [EXPERIMENTAL FREE BETA]
      </p>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full mt-2 w-full bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-neutral-600/30 scrollbar-track-transparent hover:scrollbar-thumb-neutral-600/50 bg-neutral-900">
              {isSearching || searchResults ? (
                <SearchResults
                  className="p-2"
                  onTrackSelect={handleTrackSelection}
                />
              ) : (
                <div className="p-8 text-center">
                  <h3 className="text-lg font-medium text-white mb-2">
                    Start typing to search
                  </h3>
                  <p className="text-neutral-400 text-sm">
                    Find songs, artists, and albums
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
