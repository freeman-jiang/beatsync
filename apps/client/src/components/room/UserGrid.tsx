"use client";
import { useClientId } from "@/hooks/useClientId";
import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { ClientDataType, GRID } from "@beatsync/shared";
import { ArrowUp, Crown, HeadphonesIcon, Rotate3D } from "lucide-react";
import { motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpatialGainMeter } from "../dashboard/SpatialGainMeter";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// Define prop types for components
interface ClientAvatarProps {
  client: ClientDataType;
  isCurrentUser: boolean;
  animationSyncKey: number;
  isGridEnabled: boolean;
}

// Separate Client Avatar component for better performance
const ClientAvatar = memo<ClientAvatarProps>(
  ({ client, isCurrentUser, animationSyncKey, isGridEnabled }) => {
    return (
      <Tooltip key={client.clientId}>
        <TooltipTrigger asChild>
          <motion.div
            className={cn(
              "absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300",
              "z-10"
            )}
            style={{
              opacity: isGridEnabled ? 1 : 0.5,
            }}
            initial={{
              opacity: 0.8,
              left: `${client.position.x}%`,
              top: `${client.position.y}%`,
            }}
            animate={{
              opacity: isGridEnabled ? 1 : 0.5,
              scale: 1,
              left: `${client.position.x}%`,
              top: `${client.position.y}%`,
            }}
            transition={{
              duration: 0.1,
              ease: "easeInOut",
            }}
          >
            <div className={cn("relative")}>
              <Avatar className={cn("size-10 border-2", "border-border")}>
                <AvatarImage />
                <AvatarFallback
                  className={
                    isCurrentUser ? "bg-primary-600" : "bg-neutral-600"
                  }
                >
                  {client.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Add ping effect to all clients but only when the grid is enabled */}
              {isGridEnabled && (
                <span
                  key={`ping-${animationSyncKey}`}
                  className={cn(
                    "absolute inset-0 rounded-full opacity-75 animate-ping",
                    isCurrentUser ? "bg-primary-400/40" : "bg-neutral-600"
                  )}
                ></span>
              )}
              {/* Admin crown indicator */}
              {client.isAdmin && (
                <div className="absolute -top-0 -right-0 bg-yellow-500 rounded-full p-0.5">
                  <Crown
                    className="h-2.5 w-2.5 text-yellow-900"
                    fill="currentColor"
                  />
                </div>
              )}
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs font-medium">{client.username}</div>
          <div className="text-xs text-muted-foreground">
            {isCurrentUser ? "You" : "Connected"}
            {client.isAdmin && " • Admin"}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
);

ClientAvatar.displayName = "ClientAvatar";

export const UserGrid = () => {
  const { clientId } = useClientId();
  const canMutate = useCanMutate();
  const listeningSource = useGlobalStore(
    (state) => state.listeningSourcePosition
  );
  const setListeningSourcePosition = useGlobalStore(
    (state) => state.setListeningSourcePosition
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const updateListeningSourceSocket = useGlobalStore(
    (state) => state.updateListeningSource
  );
  const stopSpatialAudio = useGlobalStore(
    (state) => state.sendStopSpatialAudio
  );
  // New state for grid enabled/disabled toggle
  const isSpatialAudioEnabled = useGlobalStore(
    (state) => state.isSpatialAudioEnabled
  );
  const setIsSpatialAudioEnabled = useGlobalStore(
    (state) => state.setIsSpatialAudioEnabled
  );
  const reorderClient = useGlobalStore((state) => state.reorderClient);

  // Use clients from global store
  const clients = useGlobalStore((state) => state.connectedClients);

  // State to track dragging status
  const isDraggingListeningSource = useGlobalStore(
    (state) => state.isDraggingListeningSource
  );
  const setIsDraggingListeningSource = useGlobalStore(
    (state) => state.setIsDraggingListeningSource
  );

  // Add animation sync timestamp
  const [animationSyncKey, setAnimationSyncKey] = useState(Date.now());

  // Reference to track last execution time
  const lastLogTimeRef = useRef(0);
  const animationFrameRef = useRef(0);

  // Manual throttle implementation for position logging
  const throttleUpdateSourcePosition = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastLogTimeRef.current >= 100) {
        console.log("Listening source update:", { position: { x, y } });
        updateListeningSourceSocket({ x, y });
        lastLogTimeRef.current = now;
      }
    },
    [updateListeningSourceSocket]
  );

  // Update animation sync key when clients change
  useEffect(() => {
    setAnimationSyncKey(Date.now());
  }, [clients]);

  // Function to update listening source position
  const onMouseMoveSource = useCallback(
    (x: number, y: number) => {
      // Ensure values are within grid bounds
      const boundedX = Math.max(0, Math.min(GRID.SIZE, x));
      const boundedY = Math.max(0, Math.min(GRID.SIZE, y));

      // Update position immediately for smooth visual feedback
      setListeningSourcePosition({
        x: boundedX,
        y: boundedY,
      });

      // Throttled network update
      throttleUpdateSourcePosition(boundedX, boundedY);
    },
    [setListeningSourcePosition, throttleUpdateSourcePosition]
  );

  // Handlers for dragging the listening source
  const handleSourceMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canMutate) return;
      e.stopPropagation(); // Prevent grid click handler from firing
      setIsDraggingListeningSource(true);
    },
    [canMutate, setIsDraggingListeningSource]
  );

  const handleSourceTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!canMutate) return;
      e.stopPropagation(); // Prevent grid touch handler from firing
      setIsDraggingListeningSource(true);
    },
    [canMutate, setIsDraggingListeningSource]
  );

  const handleSourceMouseUp = useCallback(() => {
    setIsDraggingListeningSource(false);
  }, [setIsDraggingListeningSource]);

  const handleSourceTouchEnd = useCallback(() => {
    setIsDraggingListeningSource(false);
  }, [setIsDraggingListeningSource]);

  const handleSourceMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (
        !isDraggingListeningSource ||
        !gridRef.current ||
        !isSpatialAudioEnabled
      )
        return;

      // Cancel any existing animation frame to prevent queuing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Use requestAnimationFrame for smoother updates
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!gridRef.current) return;

        const rect = gridRef.current.getBoundingClientRect();
        const gridWidth = rect.width;
        const gridHeight = rect.height;

        // Calculate position as percentage of grid size
        const x = Math.round(((e.clientX - rect.left) / gridWidth) * GRID.SIZE);
        const y = Math.round(((e.clientY - rect.top) / gridHeight) * GRID.SIZE);

        onMouseMoveSource(x, y);
      });
    },
    [isDraggingListeningSource, onMouseMoveSource, isSpatialAudioEnabled]
  );

  // Effect to handle non-passive touchmove listener for dragging
  useEffect(() => {
    const gridElement = gridRef.current;

    const touchMoveHandler = (e: TouchEvent) => {
      // Replicate the logic from the original handleSourceTouchMove
      if (!isDraggingListeningSource || !gridElement || !e.touches[0]) return;

      // Prevent scrolling while dragging
      e.preventDefault();

      // Cancel any existing animation frame to prevent queuing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Use requestAnimationFrame for smoother updates
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!gridElement || !e.touches[0]) return;

        const touch = e.touches[0];
        const rect = gridElement.getBoundingClientRect();
        const gridWidth = rect.width;
        const gridHeight = rect.height;

        // Calculate position as percentage of grid size
        const x = Math.round(
          ((touch.clientX - rect.left) / gridWidth) * GRID.SIZE
        );
        const y = Math.round(
          ((touch.clientY - rect.top) / gridHeight) * GRID.SIZE
        );

        // Call the existing position update function
        onMouseMoveSource(x, y);
      });
    };

    if (isDraggingListeningSource && gridElement) {
      // Add listener explicitly with passive: false
      gridElement.addEventListener("touchmove", touchMoveHandler, {
        passive: false,
      });
    }

    // Cleanup function
    return () => {
      if (gridElement) {
        gridElement.removeEventListener("touchmove", touchMoveHandler);
      }
      // Clean up any pending animation frames on drag end or unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDraggingListeningSource, onMouseMoveSource]); // Dependencies: run when dragging state changes or updater changes

  // Add event listeners for mouse/touch up even outside the grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDraggingListeningSource(false);
    };

    const handleGlobalTouchEnd = () => {
      setIsDraggingListeningSource(false);
    };

    if (isDraggingListeningSource) {
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("touchend", handleGlobalTouchEnd);
    }

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchend", handleGlobalTouchEnd);

      // Clean up any pending animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDraggingListeningSource, setIsDraggingListeningSource]);

  // Memoize client data to avoid unnecessary recalculations
  const clientsWithData = useMemo(() => {
    return clients.map((client) => {
      const isCurrentUser = client.clientId === clientId;
      return { client, isCurrentUser };
    });
  }, [clients, clientId]);

  return (
    <div className="flex flex-col overflow-hidden mt-1">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Rotate3D size={16} />
          <span>Spatial Audio</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={isSpatialAudioEnabled}
            onCheckedChange={(checked) => {
              if (!canMutate) return;
              setIsSpatialAudioEnabled(checked);
              if (checked) {
                // When turning on, send current listening source position
                updateListeningSourceSocket(listeningSource);
              } else if (!checked) {
                stopSpatialAudio();
              }
            }}
            disabled={!canMutate}
            className={cn(!canMutate && "opacity-50")}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {clients.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No other users connected
          </div>
        ) : (
          <>
            {/* 2D Grid Layout */}
            <div
              ref={gridRef}
              className={cn(
                "relative w-full aspect-square rounded-lg border border-border overflow-hidden bg-[size:10%_10%] bg-[position:0_0] bg-[image:linear-gradient(to_right,rgba(55,65,81,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(55,65,81,0.1)_1px,transparent_1px)] select-none touch-none",
                isSpatialAudioEnabled ? "bg-muted/30" : "bg-muted/10 opacity-75"
              )}
              onMouseMove={handleSourceMouseMove}
            >
              <TooltipProvider>
                {clientsWithData.map(({ client, isCurrentUser }) => (
                  <ClientAvatar
                    isCurrentUser={isCurrentUser}
                    key={client.clientId}
                    client={client}
                    animationSyncKey={animationSyncKey}
                    isGridEnabled={isSpatialAudioEnabled}
                  />
                ))}

                {/* Listening Source Indicator with drag capability */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div
                      className={cn(
                        "absolute z-40",
                        canMutate ? "cursor-move" : ""
                      )}
                      style={{
                        left: `${listeningSource.x}%`,
                        top: `${listeningSource.y}%`,
                        transform: "translate(-50%, -50%)",
                        opacity: isSpatialAudioEnabled && canMutate ? 1 : 0.7,
                      }}
                      {...(!isDraggingListeningSource && {
                        animate: {
                          left: `${listeningSource.x}%`,
                          top: `${listeningSource.y}%`,
                          opacity: isSpatialAudioEnabled && canMutate ? 1 : 0.7,
                        },
                        transition: {
                          type: "tween",
                          duration: 0.15,
                          ease: "linear",
                        },
                      })}
                      onMouseDown={handleSourceMouseDown}
                      onMouseUp={handleSourceMouseUp}
                      onTouchStart={handleSourceTouchStart}
                      onTouchEnd={handleSourceTouchEnd}
                    >
                      <div className="relative flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full bg-primary-400/20 p-1">
                        <span className="relative flex h-2.5 w-2.5 md:h-3 md:w-3">
                          {isSpatialAudioEnabled && (
                            <span
                              key={`source-ping-${animationSyncKey}`}
                              className="absolute inline-flex h-full w-full rounded-full bg-primary-200 opacity-75 animate-ping"
                            ></span>
                          )}
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 md:h-3 md:w-3 bg-primary-500"></span>
                        </span>
                        <HeadphonesIcon className="absolute h-1.5 w-1.5 md:h-2 md:w-2 text-primary-100 opacity-80" />
                      </div>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-xs font-medium">Listening Source</div>
                    <div className="text-xs text-muted-foreground">
                      Drag to reposition
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Gain Meter */}
            <div className="mt-2.5">
              <SpatialGainMeter />
            </div>
          </>
        )}
        <div className="flex mb-4 justify-end mt-2">
          <Button
            className="text-xs px-3 py-1 h-auto bg-neutral-700/60 hover:bg-neutral-700 text-white transition-colors duration-200 cursor-pointer w-fit disabled:opacity-50 disabled:cursor-not-allowed"
            size="sm"
            disabled={!canMutate}
            onClick={() => reorderClient(clientId || "")}
          >
            <ArrowUp className="size-4" /> Move to Top
          </Button>
        </div>
      </div>
    </div>
  );
};
