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
  GripVertical,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePostHog } from "posthog-js/react";
import LoadDefaultTracksButton from "./LoadDefaultTracksButton";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

// Sortable Queue Item Component
const SortableQueueItem = ({ 
  sourceState, 
  index, 
  isSelected, 
  isPlaying, 
  isLoading, 
  isError, 
  canMutate, 
  onItemClick, 
  onDelete 
}: {
  sourceState: AudioSourceState;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  isError: boolean;
  canMutate: boolean;
  onItemClick: (sourceState: AudioSourceState) => void;
  onDelete: (url: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sourceState.source.url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };



  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: isDragging ? 0.8 : 1, 
        y: 0,
        scale: isDragging ? 1.02 : 1,
        rotateZ: isDragging ? 2 : 0,
      }}
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
          duration: 0.4,
          delay: 0.05 * index,
          ease: "easeOut",
        },
        y: {
          duration: 0.4,
          delay: 0.05 * index,
          ease: "easeOut",
        },
      }}
             className={cn(
         "flex items-center pl-2 pr-4 py-3 rounded-md group transition-all duration-200 select-none",
         isSelected
           ? "text-white hover:bg-neutral-700/20"
           : "text-neutral-300 hover:bg-neutral-700/20",
         !canMutate && "text-white/50",
         (isLoading || isError) && "opacity-60 cursor-not-allowed",
         isDragging && "shadow-2xl bg-neutral-800/80 backdrop-blur-sm border border-primary-500/50"
       )}
      onClick={() => onItemClick(sourceState)}
    >
      {/* Drag Handle */}
      {canMutate && (
        <div
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing mr-2 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-neutral-700/30 rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4 text-neutral-400 hover:text-neutral-300 transition-colors group-hover:animate-pulse" />
        </div>
      )}

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
                {isSelected && isPlaying ? (
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
        <div className="text-xs text-neutral-500 select-none">
          {!isLoading &&
            formatTime(
              useGlobalStore.getState().getAudioDuration({ url: sourceState.source.url })
            )}
        </div>

        {/* Direct delete button */}
        {canMutate && (
          <button
            className="p-1 rounded-full text-neutral-500 hover:text-red-400 transition-colors hover:scale-110 duration-150 focus:outline-none focus:text-red-400 focus:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sourceState.source.url);
            }}
          >
            <MinusIcon className="size-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Drag Overlay Component
const DragOverlayItem = ({ sourceState, index }: { sourceState: AudioSourceState; index: number }) => {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      className="flex items-center pl-2 pr-4 py-3 rounded-md bg-neutral-800/90 backdrop-blur-sm shadow-2xl border border-neutral-600/50"
    >
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center mr-2">
        <GripVertical className="size-4 text-neutral-400" />
      </div>
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
        <span className="text-sm text-neutral-400">{index + 1}</span>
      </div>
      <div className="flex-grow min-w-0 ml-3">
        <div className="font-medium text-sm truncate text-white">
          {extractFileNameFromUrl(sourceState.source.url)}
        </div>
      </div>
    </motion.div>
  );
};

export const Queue = ({ className, ...rest }: React.ComponentProps<"div">) => {
  const posthog = usePostHog();
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioId = useGlobalStore((state) => state.selectedAudioUrl);
  const setSelectedAudioId = useGlobalStore(
    (state) => state.setSelectedAudioUrl
  );
  const isInitingSystem = useGlobalStore((state) => state.isInitingSystem);
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const canMutate = useCanMutate();
  
  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
        posthog.capture("pause_track", { track_id: source.url });
      } else {
        broadcastPlay();
        posthog.capture("play_track", { track_id: source.url });
      }
    } else {
      setSelectedAudioId(source.url);
      broadcastPlay(0);
    }
  };

  const handleDelete = (url: string) => {
    const socket = useGlobalStore.getState().socket;
    if (!socket) return;
    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.DELETE_AUDIO_SOURCES,
        urls: [url],
      },
    });
  };


  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over?.id) {
      const oldIndex = audioSources.findIndex(source => source.source.url === active.id);
      const newIndex = audioSources.findIndex(source => source.source.url === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(audioSources, oldIndex, newIndex);
        const newUrls = newOrder.map(source => source.source.url);

        // Send reorder request to server
        const socket = useGlobalStore.getState().socket;
        if (socket) {
          sendWSRequest({
            ws: socket,
            request: {
              type: ClientActionEnum.enum.REORDER_AUDIO_SOURCES,
              urls: newUrls,
            },
          });
        }
      }
    }
  };

  const activeItem = activeId ? audioSources.find(source => source.source.url === activeId) : null;
  const activeIndex = activeId ? audioSources.findIndex(source => source.source.url === activeId) : -1;

  return (
    <div className={cn("", className)} {...rest}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={audioSources.map(source => source.source.url)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {audioSources.length > 0 ? (
              <AnimatePresence initial={true}>
                {audioSources.map((sourceState, index) => {
                  const isSelected = sourceState.source.url === selectedAudioId;
                  const isLoading = sourceState.status === "loading";
                  const isError = sourceState.status === "error";

                  return (
                    <SortableQueueItem
                      key={sourceState.source.url}
                      sourceState={sourceState}
                      index={index}
                      isSelected={isSelected}
                      isPlaying={isPlaying}
                      isLoading={isLoading}
                      isError={isError}
                      canMutate={canMutate}
                      onItemClick={handleItemClick}
                      onDelete={handleDelete}
                    />
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
        </SortableContext>

        <DragOverlay>
          {activeItem && activeIndex !== -1 ? (
            <DragOverlayItem sourceState={activeItem} index={activeIndex} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
