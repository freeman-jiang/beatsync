"use client";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useState } from "react";
import { SearchMusicModal } from "./SearchMusicModal";

export const SearchMusic = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);

  return (
    <div
      className={cn(
        "border border-neutral-700/50 rounded-md mx-2 transition-all overflow-hidden",
        isHovered ? "bg-neutral-800/50" : "bg-neutral-800/30",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <label className="cursor-pointer block w-full">
        <div
          className="p-3 flex items-center gap-3"
          onClick={() => setModalOpened(true)}
        >
          <div className="bg-primary-700 text-white p-1.5 rounded-md flex-shrink-0">
            <Search className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">
              Search tracks...
            </div>
            <div className="text-xs text-neutral-400 truncate">
              Search tracks on Dab Music
            </div>
          </div>
        </div>
      </label>
      <SearchMusicModal opened={modalOpened} setOpened={setModalOpened} />
    </div>
  );
};
