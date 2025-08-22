"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { ArrowDown, Search as SearchIcon, X, ZapIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePostHog } from "posthog-js/react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { SearchResults } from "./SearchResults";

interface SearchForm {
  query: string;
}

export function InlineSearch() {
  const [showResults, setShowResults] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showCheckmark, setShowCheckmark] = React.useState(false);
  const isMobile = useIsMobile();
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const canMutate = useCanMutate();
  const socket = useGlobalStore((state) => state.socket);
  const posthog = usePostHog();
  const setIsSearching = useGlobalStore((state) => state.setIsSearching);
  const setSearchQuery = useGlobalStore((state) => state.setSearchQuery);
  const setSearchOffset = useGlobalStore((state) => state.setSearchOffset);
  const setHasMoreResults = useGlobalStore((state) => state.setHasMoreResults);
  const searchResults = useGlobalStore((state) => state.searchResults);
  const isSearching = useGlobalStore((state) => state.isSearching);
  const activeStreamJobs = useGlobalStore((state) => state.activeStreamJobs);
  const { register, handleSubmit, setFocus, watch, reset } =
    useForm<SearchForm>({
      defaultValues: { query: "" },
    });

  const watchedQuery = watch("query");

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Add keyboard shortcuts for ⌘K to toggle focus and ESC to dismiss
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC key to dismiss search results
      if (e.key === "Escape") {
        if (showResults) {
          e.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      // ⌘K to toggle focus (only when user can mutate)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();

        if (!canMutate) {
          return;
        }

        if (isFocused) {
          // Blur the currently focused element and hide results
          (document.activeElement as HTMLElement)?.blur();
          setShowResults(false);
        } else {
          // Focus the input using RHF's setFocus
          setFocus("query");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFocus, isFocused, canMutate, showResults]);

  // Dismiss search results when input becomes empty
  React.useEffect(() => {
    if (!watchedQuery || watchedQuery.trim() === "") {
      setShowResults(false);
    }
  }, [watchedQuery]);

  const onSubmit = (data: SearchForm) => {
    if (!canMutate) {
      return;
    }

    if (!socket) {
      console.error("WebSocket not connected");
      return;
    }

    if (!data.query || !data.query.trim()) return;

    console.log("Sending search request", data.query);

    // Track search event
    posthog.capture("search_music", {
      query: data.query,
    });

    // Reset pagination state for new search and set loading state
    setSearchOffset(0);
    setHasMoreResults(false);
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
    // Show checkmark animation
    setShowCheckmark(true);

    // Dismiss search results immediately and clear input
    setShowResults(false);
    reset(); // Clear the form input

    // Hide checkmark after 2 seconds
    setTimeout(() => {
      setShowCheckmark(false);
    }, 2000);
  };

  const handleFocus = () => {
    if (!canMutate) return;
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Clear any existing timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    // Check if the new focus target is within our container
    if (!e.currentTarget.contains(e.relatedTarget)) {
      // On mobile, never dismiss on blur - only through explicit close button
      if (!isMobile) {
        // On desktop, hide immediately
        setShowResults(false);
      }
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    // Clear the timeout if it exists
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  };

  return (
    <div
      className="relative w-full"
      onBlur={handleBlur}
      onFocus={() => {
        // Cancel any pending blur timeout when focus returns
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
        }
      }}
    >
      {/* Search Input */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="relative group">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5">
            <AnimatePresence mode="wait">
              {activeStreamJobs > 0 ? (
                <motion.div
                  key="streaming"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center gap-1.5"
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="35"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        className="text-green-500"
                        strokeDasharray={2 * Math.PI * 35 * 0.25}
                        animate={{
                          rotate: [0, 360],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        style={{
                          transformOrigin: "center",
                        }}
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-mono text-green-400 font-medium">
                    {activeStreamJobs}
                  </span>
                </motion.div>
              ) : showCheckmark ? (
                <motion.div
                  key="checkmark"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="w-5 h-5 flex items-center justify-center"
                >
                  <ArrowDown className="w-full h-full text-green-500" />
                </motion.div>
              ) : (
                <motion.div
                  key="search"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="w-5 h-5 flex items-center justify-center"
                >
                  <SearchIcon
                    className={cn(
                      "w-full h-full transition-colors duration-200",
                      canMutate
                        ? "text-neutral-400 group-focus-within:text-white/80"
                        : "text-neutral-600"
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <input
            {...register("query")}
            type="text"
            placeholder={
              canMutate
                ? "What do you want to play?"
                : "Search requires admin permissions"
            }
            onFocus={handleFocus}
            onBlur={() => setIsFocused(false)}
            disabled={!canMutate}
            className={cn(
              "w-full h-10 pr-24 sm:pr-20 border border-neutral-600/30 rounded-lg text-base sm:text-sm font-normal transition-all duration-200 focus:outline-none truncate",
              activeStreamJobs > 0 ? "pl-14" : "pl-10",
              canMutate
                ? "bg-white/10 hover:bg-white/15 focus:bg-white/15 focus:ring-2 focus:ring-white/80 text-white placeholder:text-neutral-400"
                : "bg-neutral-800/50 text-neutral-500 placeholder:text-neutral-600 cursor-not-allowed"
            )}
          />
          <div className="absolute right-1 top-1/2 transform -translate-y-1/2 pointer-events-none w-12 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {showCheckmark ? (
                <motion.div
                  key="checkmark"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <ArrowDown className="w-5 h-5 text-green-500" />
                </motion.div>
              ) : (
                <motion.div
                  key="shortcut"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <kbd
                    className={cn(
                      "inline-flex h-6 items-center gap-0.5 rounded border border-neutral-600/50 bg-neutral-700/50 px-2 font-mono text-xs font-medium transition-colors duration-200",
                      canMutate
                        ? "text-neutral-400"
                        : "text-neutral-600 opacity-50"
                    )}
                  >
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>

      {/* Beta Disclaimer */}
      <div className="mt-2 flex items-center gap-1 text-[10px] font-mono text-neutral-500 ml-0.5">
        <ZapIcon className="size-3 text-neutral-400 stroke-1" />
        <span>[EXPERIMENTAL FREE BETA]</span>
      </div>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {showResults && canMutate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full mt-2 w-full bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl overflow-hidden z-[60]"
          >
            {/* Mobile close button */}
            {isMobile && (
              <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-800/50">
                <button
                  onClick={handleCloseResults}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm text-neutral-400 hover:text-white transition-colors"
                  type="button"
                >
                  <span>Search Results</span>
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div
              className={cn(
                "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-neutral-600/30 scrollbar-track-transparent hover:scrollbar-thumb-neutral-600/50 bg-neutral-900",
                isMobile ? "max-h-[70vh]" : "max-h-[60vh]"
              )}
            >
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
