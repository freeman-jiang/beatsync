import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocalAudioSource } from "@/lib/localTypes";
import { cn, formatTime } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { MoreHorizontal, Pause, Play, UploadCloud } from "lucide-react";

export const Queue = ({ className, ...rest }: React.ComponentProps<"div">) => {
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioId);
  const setSelectedAudioId = useGlobalStore(
    (state) => state.setSelectedAudioId
  );
  const isLoadingAudioSources = useGlobalStore((state) => state.isLoadingAudio);
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const reuploadAudio = useGlobalStore((state) => state.reuploadAudio);

  const handleItemClick = (source: LocalAudioSource) => {
    if (source.id === selectedAudioId) {
      if (isPlaying) {
        broadcastPause();
      } else {
        broadcastPlay();
      }
    } else {
      setSelectedAudioId(source.id);
      broadcastPlay(0);
    }
  };

  return (
    <div className={cn("", className)} {...rest}>
      {/* <h2 className="text-xl font-bold mb-2 select-none">Beatsync</h2> */}
      <div className="space-y-1">
        {audioSources.length > 0 ? (
          audioSources.map((source, index) => {
            const isSelected = source.id === selectedAudioId;
            const isPlayingThis = isSelected && isPlaying;

            return (
              <div
                key={source.id}
                className={cn(
                  "flex items-center pl-2 pr-4 py-3 rounded-md group transition-colors select-none",
                  isSelected
                    ? "text-white hover:bg-neutral-700/20"
                    : "text-neutral-300 hover:bg-neutral-700/20"
                )}
                onClick={() => handleItemClick(source)}
              >
                {/* Track number / Play icon */}
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center relative cursor-default select-none">
                  {/* Play/Pause button (shown on hover) */}
                  <button className="text-white text-sm hover:scale-110 transition-transform w-full h-full flex items-center justify-center absolute inset-0 opacity-0 group-hover:opacity-100 select-none">
                    {isSelected && isPlaying ? (
                      <Pause className="fill-current size-3.5 stroke-1" />
                    ) : (
                      <Play className="fill-current size-3.5" />
                    )}
                  </button>

                  {/* Playing indicator or track number (hidden on hover) */}
                  <div className="w-full h-full flex items-center justify-center group-hover:opacity-0 select-none">
                    {isPlayingThis ? (
                      <div className="flex items-end justify-center h-4 w-4 gap-[2px]">
                        <div className="bg-primary-500 w-[2px] h-[40%] animate-[sound-wave-1_1.2s_ease-in-out_infinite]"></div>
                        <div className="bg-primary-500 w-[2px] h-[80%] animate-[sound-wave-2_1.4s_ease-in-out_infinite]"></div>
                        <div className="bg-primary-500 w-[2px] h-[60%] animate-[sound-wave-3_1s_ease-in-out_infinite]"></div>
                      </div>
                    ) : (
                      <span
                        className={cn(
                          "text-sm group-hover:opacity-0 select-none",
                          isSelected ? "text-primary-400" : "text-neutral-400"
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* Track name */}
                <div className="flex-grow min-w-0 ml-3 select-none">
                  <div
                    className={cn(
                      "font-medium text-sm truncate select-none",
                      isSelected ? "text-primary-400" : ""
                    )}
                  >
                    {source.name}
                  </div>
                </div>

                {/* Duration & Optional Re-upload Menu */}
                <div className="ml-4 flex items-center gap-2">
                  <div className="text-xs text-neutral-500 select-none">
                    {formatTime(source.audioBuffer.duration)}
                  </div>

                  {/* Dropdown for re-uploading - Always shown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="p-1 rounded-full text-neutral-500 hover:text-white transition-colors hover:scale-110 duration-150 focus:outline-none focus:text-white focus:scale-110">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem
                        onSelect={() => reuploadAudio(source.id, source.name)}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <UploadCloud className="size-3.5 text-neutral-400" />
                        <span>Reupload to room</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-3 text-neutral-400 select-none">
            {isLoadingAudioSources
              ? "Loading tracks..."
              : "No tracks available"}
          </div>
        )}
      </div>
    </div>
  );
};
