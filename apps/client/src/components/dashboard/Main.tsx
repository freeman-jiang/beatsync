import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Queue } from "../Queue";
import { useGlobalStore } from "@/store/global";
import { YouTubeQueue } from "../youtube/YouTubeQueue";
import { YouTubePlayer } from "../youtube/YouTubePlayer";
import { YouTubeUrlInput } from "../youtube/YouTubeUrlInput";
import { YouTubeSearch } from "../youtube/YouTubeSearch";
import { Button } from "../ui/button";
import { Search, Plus, List } from "lucide-react";
import { useState } from "react";

export const Main = () => {
  const currentMode = useGlobalStore((state) => state.currentMode);
  const [youtubeTab, setYoutubeTab] = useState<'search' | 'url' | 'queue'>('search');

  return (
    <motion.div
      className={cn(
        "w-full lg:flex-1 overflow-y-auto bg-gradient-to-b from-neutral-900/90 to-neutral-950 backdrop-blur-xl bg-neutral-950 h-full",
        "scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20"
      )}
    >
      <motion.div className="p-6 pt-4">
        {currentMode === 'library' ? (
          <>
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-white mb-2">Music Library</h1>
              <p className="text-neutral-400 text-sm">Upload and manage your audio files</p>
            </div>
            <Queue className="mb-8" />
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">YouTube Player</h1>
              <p className="text-neutral-400 text-sm">Search and play YouTube videos synchronized across all devices</p>
            </div>

            {/* YouTube Tabs */}
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <Button
                  onClick={() => setYoutubeTab('search')}
                  variant={youtubeTab === 'search' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Button>
                <Button
                  onClick={() => setYoutubeTab('url')}
                  variant={youtubeTab === 'url' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add URL
                </Button>
                <Button
                  onClick={() => setYoutubeTab('queue')}
                  variant={youtubeTab === 'queue' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <List className="h-4 w-4" />
                  Queue
                </Button>
              </div>

              {/* Tab Content */}
              <div className="bg-neutral-900/30 rounded-lg p-4 min-h-[400px]">
                {youtubeTab === 'search' && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Search YouTube</h3>
                    <YouTubeSearch />
                  </div>
                )}
                
                {youtubeTab === 'url' && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Add by URL</h3>
                    <YouTubeUrlInput />
                  </div>
                )}
                
                {youtubeTab === 'queue' && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Video Queue</h3>
                    <YouTubeQueue />
                  </div>
                )}
              </div>
            </div>

            {/* YouTube Player */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Current Video</h2>
              <div className="bg-neutral-900/30 rounded-lg p-4">
                <YouTubePlayer />
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};
