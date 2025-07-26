"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import {
  ClientActionEnum,
  PlaybackControlsPermissionsEnum,
} from "@beatsync/shared";
import { Crown, Play, Users } from "lucide-react";
import { motion } from "motion/react";

export const PlaybackPermissions = () => {
  const currentUser = useGlobalStore((state) => state.currentUser);
  const socket = useGlobalStore((state) => state.socket);
  const playbackControlsPermissions = useGlobalStore(
    (state) => state.playbackControlsPermissions
  );

  // Only show if socket is connected
  if (!socket) {
    return null;
  }

  const isAdmin = currentUser?.isAdmin || false;

  const isAdminOnly =
    playbackControlsPermissions ===
    PlaybackControlsPermissionsEnum.enum.ADMIN_ONLY;

  const handleToggle = () => {
    const newPermission = isAdminOnly
      ? PlaybackControlsPermissionsEnum.enum.EVERYONE
      : PlaybackControlsPermissionsEnum.enum.ADMIN_ONLY;

    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.SET_PLAYBACK_CONTROLS,
        permissions: newPermission,
      },
    });
  };

  return (
    <div className="">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
          <Play className="h-3.5 w-3.5" />
          <span>Playback Permissions</span>
        </h2>
      </div>

      <div className="px-4 pb-3">
        {/* Toggle Container */}
        <button
          onClick={isAdmin ? handleToggle : undefined}
          disabled={!isAdmin}
          className={cn(
            "relative flex w-full h-8 bg-neutral-800 rounded-lg p-0.5 mt-2.5 focus:outline-none",
            isAdmin ? "cursor-pointer" : "opacity-75"
          )}
        >
          {/* Sliding Background */}
          <motion.div
            className={cn(
              "absolute inset-y-0.5 w-1/2 transition-colors duration-300 rounded-lg",
              isAdminOnly ? "bg-yellow-600" : "bg-green-600"
            )}
            initial={false}
            animate={{
              x: isAdminOnly ? "calc(100% - 4px)" : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 700,
              damping: 40,
            }}
          />

          {/* Everyone Option */}
          <div
            className={cn(
              "relative z-10 flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors duration-200 h-full",
              !isAdminOnly ? "text-white" : "text-neutral-400"
            )}
          >
            <Users className="h-3 w-3" />
            <span>Everyone</span>
          </div>

          {/* Admin Only Option */}
          <div
            className={cn(
              "relative z-10 flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors duration-200 h-full",
              isAdminOnly ? "text-white" : "text-neutral-400"
            )}
          >
            <Crown className="h-3 w-3" />
            <span>Admins</span>
          </div>
        </button>
      </div>
    </div>
  );
};
