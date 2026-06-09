"use client";
import { generateName } from "@/lib/randomNames";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { fetchRoomInfo } from "@/lib/api";
import { useRoomStore } from "@/store/room";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { IS_DEMO_MODE } from "@/lib/demo";
import { Dashboard } from "./dashboard/Dashboard";
import { DemoDashboard } from "./dashboard/DemoDashboard";
import { PasswordModal } from "./PasswordModal";
import { WebSocketManager } from "./room/WebSocketManager";

interface NewSyncerProps {
  roomId: string;
}

// Main component has been refactored into smaller components
export const NewSyncer = ({ roomId }: NewSyncerProps) => {
  const setUsername = useRoomStore((state) => state.setUsername);
  const setRoomId = useRoomStore((state) => state.setRoomId);
  const username = useRoomStore((state) => state.username);

  // Password gate state
  const [isPrivate, setIsPrivate] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [roomInfoLoaded, setRoomInfoLoaded] = useState(false);

  // Update document title based on playback state
  useDocumentTitle();

  // Generate a new random username when the component mounts
  useEffect(() => {
    setRoomId(roomId);
    if (!username) {
      setUsername(generateName());
    }
  }, [setUsername, username, roomId, setRoomId]);

  // Pre-check if the room is private before connecting the WebSocket
  useEffect(() => {
    let cancelled = false;
    fetchRoomInfo(roomId)
      .then((info) => {
        if (cancelled) return;
        setIsPrivate(info.isPrivate);
        if (!info.isPrivate) setPasswordVerified(true);
      })
      .catch(() => {
        if (!cancelled) setPasswordVerified(true); // Fail open — let WS handle auth
      })
      .finally(() => {
        if (!cancelled) setRoomInfoLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const showPasswordGate = roomInfoLoaded && isPrivate && !passwordVerified;
  const canConnect = roomInfoLoaded && (!isPrivate || passwordVerified);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Password gate */}
      {showPasswordGate && <PasswordModal roomId={roomId} onVerified={() => setPasswordVerified(true)} />}

      {/* WebSocket connection manager (non-visual component) — only after auth */}
      {canConnect && <WebSocketManager roomId={roomId} username={username} />}

      {/* Spatial audio background effects */}
      {/* <SpatialAudioBackground /> */}

      {IS_DEMO_MODE ? <DemoDashboard roomId={roomId} /> : <Dashboard roomId={roomId} />}
    </motion.div>
  );
};
