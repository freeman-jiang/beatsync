"use client";
import { fetchDiscoverRooms } from "@/lib/api";
import { generateName } from "@/lib/randomNames";
import { cn, extractFileNameFromUrl } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { useQuery } from "@tanstack/react-query";
import { LogIn, Music, Users } from "lucide-react";
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

  console.log("discoverRooms", discoverRooms);

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
      className="mt-8 w-full max-w-[28rem]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
    >
      <h3 className="text-xs font-medium text-neutral-400 mb-4 uppercase tracking-wider">
        Active Rooms
      </h3>
      <div className="space-y-2">
        {discoverRooms.slice(0, 3).map((room, index) => (
          <motion.div
            key={room.roomId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.8 + index * 0.05 }}
            className={cn(
              "group relative bg-neutral-900/50 rounded-lg border border-neutral-800 p-3",
              "hover:bg-neutral-900 hover:border-neutral-700 transition-all duration-200 cursor-pointer",
              room.playbackState.type === "playing" &&
                "border-neutral-800 bg-neutral-900/50"
            )}
            onClick={() => handleJoinRoom(room.roomId)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">
                    Room {room.roomId}
                  </span>
                  {room.playbackState.type === "playing" && (
                    <div className="flex items-center gap-1">
                      <div className="relative flex items-center justify-center">
                        <div className="size-1.5 bg-green-500 rounded-full" />
                        <div className="absolute size-2 bg-green-500/30 rounded-full animate-ping" />
                      </div>
                      <span className="text-[10px] text-green-400 font-medium">
                        Playing
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-neutral-300 truncate mb-2">
                  {extractFileNameFromUrl(room.playbackState.audioSource)}
                </p>

                <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>
                      {room.clients.length}{" "}
                      {room.clients.length === 1 ? "listener" : "listeners"}
                    </span>
                  </div>
                  <span className="text-neutral-700">•</span>
                  <div className="flex items-center gap-1">
                    <Music className="w-3 h-3" />
                    <span>
                      {room.audioSources.length}{" "}
                      {room.audioSources.length === 1 ? "track" : "tracks"}
                    </span>
                  </div>
                </div>
              </div>

              <motion.div
                className="flex items-center text-neutral-500 group-hover:text-neutral-300 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 + index * 0.05 }}
              >
                <LogIn className="w-4 h-4" />
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>
      {discoverRooms.length > 3 && (
        <motion.p
          className="text-[11px] text-neutral-500 text-center mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1 }}
        >
          +{discoverRooms.length - 3} more active{" "}
          {discoverRooms.length - 3 === 1 ? "room" : "rooms"}
        </motion.p>
      )}
    </motion.div>
  );
};
