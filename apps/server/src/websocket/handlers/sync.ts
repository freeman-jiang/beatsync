import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { DEMO } from "@/config";
import { sendToClient } from "@/utils/responses";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSync: HandlerFunction<ExtractWSRequestFrom["SYNC"]> = ({ ws }) => {
  const { room } = requireRoom(ws);

  // In demo mode, send audio sources on the first SYNC only (the "Start System" SYNC).
  // Subsequent SYNCs are steady-state heartbeats and should not re-trigger audio loading.
  // We use a flag on room's client data to track whether we've already sent sources.
  if (DEMO && !room.hasReceivedAudioSources(ws.data.clientId)) {
    room.markReceivedAudioSources(ws.data.clientId);
    const audioSources = room.getAudioSources();
    if (audioSources.length > 0) {
      sendToClient({
        ws,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_AUDIO_SOURCES",
            sources: audioSources,
            currentAudioSource: room.getPlaybackState().audioSource || undefined,
            eagerLoad: true,
          },
        },
      });
    }
  }

  room.syncClient(ws);
};
