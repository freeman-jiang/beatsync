"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchDiscoverRooms } from "@/lib/api";
import { generateName } from "@/lib/randomNames";
import { cn, extractFileNameFromUrl, getOldestClient } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users2 } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";

export const ActiveRooms = () => {
  const router = useRouter();
  const posthog = usePostHog();
  const username = useRoomStore((state) => state.username);
  const setUsername = useRoomStore((state) => state.setUsername);

  const { data: discoverRooms } = useQuery({
    queryKey: ["discover-rooms"],
    queryFn: fetchDiscoverRooms,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const handleJoinRoom = (roomId: string) => {
    // Ensure username is set
    if (!username) {
      const generatedName = generateName();
      setUsername(generatedName);
    }

    posthog.capture("join_room_from_discover", {
      room_id: roomId,
      username: username || "generated",
    });
    router.push(`/room/${roomId}`);
  };

  if (!discoverRooms || discoverRooms.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="mt-12 w-full max-w-[32rem]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <h3 className="text-[11px] font-semibold text-neutral-500 mb-3 uppercase tracking-[0.1em]">
        Discover
      </h3>
      <div className="space-y-1">
        {discoverRooms.slice(0, 4).map((room, index) => (
          <motion.div
            key={room.roomId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
            className={cn(
              "group relative rounded-md p-3 -mx-3",
              "hover:bg-white/[0.05] transition-colors duration-200 cursor-pointer"
            )}
            onClick={() => handleJoinRoom(room.roomId)}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Flag indicator - show oldest user's flag */}
                <div className="relative size-10 flex-shrink-0">
                  {(() => {
                    const oldestClient = getOldestClient(room.clients);
                    const flagSvgURL = oldestClient.location?.flagSvgURL;
                    const isPlaying = room.playbackState.type === "playing";

                    return (
                      <div
                        className={cn(
                          "w-full h-full rounded flex items-center justify-center overflow-hidden",
                          isPlaying && ""
                        )}
                      >
                        {flagSvgURL ? (
                          <img
                            src={flagSvgURL}
                            alt="Country flag"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                            <Users2 className="w-5 h-5 text-neutral-600" />
                          </div>
                        )}
                        {/* {isPlaying && (
                          <div className="absolute -top-1 -right-1">
                            <div className="relative flex items-center justify-center">
                              <div className="size-2 bg-green-500 rounded-full" />
                              <div className="absolute size-2 bg-green-500/30 rounded-full animate-ping" />
                            </div>
                          </div>
                        )} */}
                      </div>
                    );
                  })()}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">
                    {extractFileNameFromUrl(room.playbackState.audioSource) ||
                      "No track playing"}
                  </p>
                  <p className="text-xs font-mono text-neutral-500 mt-0.5">
                    {room.roomId}
                  </p>
                </div>
              </div>

              {/* Stacked avatars and arrow */}
              <div className="flex items-center gap-3">
                {/* Stacked country flag avatars and track count */}
                <div className="flex flex-col items-end gap-1">
                  {/* Stacked country flag avatars */}
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2.5">
                      {room.clients.slice(0, 5).map((client) => (
                        <Avatar
                          key={client.clientId}
                          className="size-5 ring-1 ring-black/60 transition-all"
                        >
                          {client.location?.flagSvgURL ? (
                            <AvatarImage
                              src={client.location.flagSvgURL}
                              alt={`${
                                client.location.country || "Country"
                              } flag`}
                            />
                          ) : (
                            <AvatarFallback className="bg-neutral-800">
                              <Users2 className="w-2.5 h-2.5 text-neutral-500" />
                            </AvatarFallback>
                          )}
                        </Avatar>
                      ))}
                    </div>
                    {room.clients.length > 5 && (
                      <span className="text-[11px] text-neutral-500 font-medium">
                        +{room.clients.length - 5}
                      </span>
                    )}
                  </div>
                  {/* Track count */}
                  {room.audioSources.length > 1 && (
                    <span className="text-[11px] text-neutral-500 font-medium">
                      {room.audioSources.length} tracks
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors flex-shrink-0" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {discoverRooms.length > 4 && (
        <motion.button
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors mt-4 font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          onClick={() => console.log("Show all rooms")}
        >
          Show all {discoverRooms.length} rooms
        </motion.button>
      )}
    </motion.div>
  );
};
