"use client";
import { generateName } from "@/lib/randomNames";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRoomStore } from "@/store/room";
import type { RoomTypeValue } from "@beatsync/shared";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { IS_DEMO_MODE } from "@/lib/demo";
import { Dashboard } from "./dashboard/Dashboard";
import { DemoDashboard } from "./dashboard/DemoDashboard";
import { WebSocketManager } from "./room/WebSocketManager";

// Leaflet is browser-only — dynamic-import the map shell with ssr:false to keep Next's
// SSR pipeline happy. The chunk only loads in map rooms, so audio rooms pay no cost.
const MapRoom = dynamic(() => import("./map/MapRoom").then((m) => m.MapRoom), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-sm text-neutral-400">Loading map…</div>,
});

interface NewSyncerProps {
  roomId: string;
  /** Which room type the URL asked for. The server's ROOM_TYPE_INFO has final say. */
  requestedRoomType?: RoomTypeValue;
}

export const NewSyncer = ({ roomId, requestedRoomType }: NewSyncerProps) => {
  const setUsername = useRoomStore((state) => state.setUsername);
  const setRoomId = useRoomStore((state) => state.setRoomId);
  const setRequestedRoomType = useRoomStore((state) => state.setRequestedRoomType);
  const username = useRoomStore((state) => state.username);
  const roomType = useRoomStore((state) => state.roomType);

  // Update document title based on playback state
  useDocumentTitle();

  // Generate a new random username when the component mounts
  useEffect(() => {
    setRoomId(roomId);
    setRequestedRoomType(requestedRoomType);
    if (!username) {
      setUsername(generateName());
    }
  }, [setUsername, username, roomId, setRoomId, requestedRoomType, setRequestedRoomType]);

  // Until ROOM_TYPE_INFO arrives, render the "most likely" UI based on the URL's
  // requested type so visitors don't see a flash of the wrong dashboard.
  const effectiveRoomType: RoomTypeValue = roomType ?? requestedRoomType ?? "audio";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* WebSocket connection manager (non-visual component) */}
      <WebSocketManager roomId={roomId} username={username} requestedRoomType={requestedRoomType} />

      {effectiveRoomType === "map" ? (
        <MapRoom roomId={roomId} />
      ) : IS_DEMO_MODE ? (
        <DemoDashboard roomId={roomId} />
      ) : (
        <Dashboard roomId={roomId} />
      )}
    </motion.div>
  );
};
