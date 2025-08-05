"use client";

import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Search as SearchIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SearchResults } from "./SearchResults";

export function Search() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const socket = useGlobalStore((state) => state.socket);
  const setIsSearching = useGlobalStore((state) => state.setIsSearching);
  const setSearchQuery = useGlobalStore((state) => state.setSearchQuery);
  const clearSearchResults = useGlobalStore(
    (state) => state.clearSearchResults
  );
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSearch = (searchQuery: string) => {
    if (!socket) {
      console.error("WebSocket not connected");
      return;
    }

    console.log("Sending search request", searchQuery);

    // Set loading state and store query
    setIsSearching(true);
    setSearchQuery(searchQuery);

    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.SEARCH_MUSIC,
        query: searchQuery,
      },
    });

    // Don't close the dialog - keep it open to show results
    // setOpen(false);
    setQuery("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setQuery("");
      // Clear search results when dialog closes
      clearSearchResults();
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start text-neutral-400 bg-neutral-800/30 border-neutral-700/50 hover:bg-neutral-800/50 hover:border-neutral-600 transition-all duration-200 rounded-lg h-9 px-3 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="h-3.5 w-3.5 text-neutral-500" />
        <span className="text-sm font-normal">Search for music...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border border-neutral-600/50 bg-neutral-700/50 px-1.5 font-mono text-xs font-medium text-neutral-400">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput
          placeholder="Search for music..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            // Handle Enter key to trigger search when there's text
            if (e.key === "Enter" && query.trim()) {
              e.preventDefault();
              handleSearch(query);
            }
          }}
        />
        <CommandList>
          {/* Search Results Component */}
          <div className="px-1">
            <SearchResults />
          </div>

          {/* Show search prompt or recent searches when no results */}
          <div className="border-t border-neutral-700/30 mt-2">
            <CommandEmpty>No results found.</CommandEmpty>
            {query && (
              <CommandGroup heading="Search for Music">
                <CommandItem onSelect={() => handleSearch(query)}>
                  <SearchIcon className="mr-2 h-4 w-4" />
                  <span>Search for &quot;{query}&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Recent Searches">
              <CommandItem onSelect={() => handleSearch("Electronic music")}>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Electronic music</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSearch("Jazz classics")}>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Jazz classics</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSearch("Lo-fi beats")}>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Lo-fi beats</span>
              </CommandItem>
            </CommandGroup>
          </div>
        </CommandList>
      </CommandDialog>
    </>
  );
}
