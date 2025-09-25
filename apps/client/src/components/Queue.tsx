import { cn, extractFileNameFromUrl, formatTime } from "@/lib/utils";
import { AudioSourceState, useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import {
  AlertCircle,
  Loader2,
  MinusIcon,
  // MoreHorizontal, // Keeping for potential future use
  Pause,
  Play,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import LoadDefaultTracksButton from "./LoadDefaultTracksButton";

export const Queue = ({ className, ...rest }: React.ComponentProps<"div">) => {
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioUrl);
  const changeAudioSource = useGlobalStore((state) => state.changeAudioSource);
  const isInitingSystem = useGlobalStore((state) => state.isInitingSystem);
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const getAudioDuration = useGlobalStore((state) => state.getAudioDuration);
  const getSelectedTrack = useGlobalStore((state) => state.getSelectedTrack);
  const canMutate = useCanMutate();
  // socket handled by child button component when needed

  const handleItemClick = (sourceState: AudioSourceState) => {
    if (!canMutate) return;

    // Don't allow interaction with loading or error tracks
    if (sourceState.status === "loading") {
      // Could show a toast here if desired
      return;
    }
    if (sourceState.status === "error") {
      // Could show error details in a toast
      return;
    }

    const source = sourceState.source;
    if (source.url === selectedAudioId) {
      if (isPlaying) {
        broadcastPause();
      } else {
        broadcastPlay();
      }
    } else {
      changeAudioSource(source.url);
      broadcastPlay(0);
    }
  };

  return (
    <div className={cn("", className)} {...rest}>
      {/* <h2 className="text-xl font-bold mb-2 select-none">Beatsync</h2> */}
      <div className="space-y-1">
        {audioSources.length > 0 ? (
          <AnimatePresence initial={true}>
            {/* Ensure keys are stable and unique even if duplicates attempted */}
            {audioSources.map((sourceState, index) => {
              const selectedTrack = getSelectedTrack();
              const isSelected =
                selectedTrack?.source.url === sourceState.source.url;
              const isPlayingThis = isSelected && isPlaying;
              const isLoading = sourceState.status === "loading";
              const isError = sourceState.status === "error";

              return (
                <motion.div
                  key={sourceState.source.url}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: -10,
                    transition: {
                      duration: 0.25,
                      ease: "easeInOut",
                    },
                  }}
                  transition={{
                    layout: {
                      type: "spring",
                      stiffness: 400,
                      damping: 45,
                      mass: 1,
                    },
                    opacity: {
                      duration: 0.3,
                      delay: Math.min(0.05 * index, 0.3), // Cap maximum delay at 300ms
                      ease: "easeOut",
                    },
                    y: {
                      duration: 0.3,
                      delay: Math.min(0.05 * index, 0.3), // Cap maximum delay at 300ms
                      ease: "easeOut",
                    },
                  }}
                  className={cn(
                    "flex items-center pl-2 pr-4 py-3 rounded-md group transition-colors select-none",
                    isSelected
                      ? "text-white hover:bg-neutral-700/20"
                      : "text-neutral-300 hover:bg-neutral-700/20",
                    !canMutate && "text-white/50",
                    (isLoading || isError) && "opacity-60 cursor-not-allowed"
                  )}
                  onClick={() => handleItemClick(sourceState)}
                >
                  {/* Track number / Play icon */}
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center relative cursor-default select-none">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: {
                              duration: 0.3,
                              ease: "easeOut",
                            },
                          }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Loader2 className="size-4 animate-spin text-neutral-400" />
                        </motion.div>
                      ) : isError ? (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0 }}
                          animate={{
                            opacity: 1,
                            transition: {
                              duration: 0.3,
                              ease: "easeOut",
                            },
                          }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <AlertCircle className="size-4 text-red-400" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="loaded"
                          initial={{ opacity: 0 }}
                          animate={{
                            opacity: 1,
                            transition: {
                              duration: 0.3,
                              ease: "easeOut",
                            },
                          }}
                          className="absolute inset-0"
                        >
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
                                  isSelected
                                    ? "text-primary-400"
                                    : "text-neutral-400"
                                )}
                              >
                                {index + 1}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Track name */}
                  <div className="flex-grow min-w-0 ml-3 select-none">
                    <div
                      className={cn(
                        "font-medium text-sm truncate select-none",
                        isSelected && !isLoading ? "text-primary-400" : "",
                        isError && "text-red-400",
                        isLoading && "opacity-60"
                      )}
                    >
                      {extractFileNameFromUrl(sourceState.source.url)}
                      {isError && sourceState.error && (
                        <span className="text-xs text-red-400 ml-2">
                          ({sourceState.error})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration & Delete Button */}
                  <div className="ml-4 flex items-center gap-2">
                    <motion.div
                      className="text-xs text-neutral-500 select-none min-w-[3rem] text-right"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      {!isLoading &&
                      sourceState.status === "loaded" &&
                      isSelected ? (
                        <motion.span
                          key="duration"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          {formatTime(
                            getAudioDuration({ url: sourceState.source.url })
                          )}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="placeholder"
                          className="text-neutral-700"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          --:--
                        </motion.span>
                      )}
                    </motion.div>

                    {/* Direct delete button */}
                    {canMutate && (
                      <button
                        className="p-1 rounded-full text-neutral-500 hover:text-red-400 transition-colors hover:scale-110 duration-150 focus:outline-none focus:text-red-400 focus:scale-110"
                        onClick={(e) => {
                          e.stopPropagation();
                          const socket = useGlobalStore.getState().socket;
                          if (!socket) return;
                          sendWSRequest({
                            ws: socket,
                            request: {
                              type: ClientActionEnum.enum.DELETE_AUDIO_SOURCES,
                              urls: [sourceState.source.url],
                            },
                          });
                        }}
                      >
                        <MinusIcon className="size-4" />
                      </button>
                    )}

                    {/* Dropdown for re-uploading - Commented out for potential future use */}
                    {/* <DropdownMenu>
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
                        {canMutate && (
                          <DropdownMenuItem
                            className="flex items-center gap-2 cursor-pointer text-sm"
                            onClick={() => {
                              const socket = useGlobalStore.getState().socket;
                              if (!socket) return;
                              sendWSRequest({
                                ws: socket,
                                request: {
                                  type: ClientActionEnum.enum
                                    .DELETE_AUDIO_SOURCES,
                                  urls: [sourceState.source.url],
                                },
                              });
                            }}
                          >
                            <span>Remove from queue</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu> */}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full text-center text-neutral-300 select-none flex flex-col items-center justify-center gap-3"
          >
            {isInitingSystem ? (
              "Loading tracks..."
            ) : canMutate ? (
              <>
                <div className="text-sm text-neutral-400">No tracks yet</div>
                <LoadDefaultTracksButton />
              </>
            ) : (
              "No tracks available"
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
