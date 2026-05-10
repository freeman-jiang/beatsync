import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleAudioSourceLoaded: HandlerFunction<ExtractWSRequestFrom["AUDIO_SOURCE_LOADED"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireRoom(ws);

  // Map rooms route per-shape so multiple shape loads can be in flight simultaneously.
  if (room.isMapRoom() && message.shapeId) {
    room.processClientLoadedShapeAudio(message.shapeId, ws.data.clientId, server);
    return;
  }

  room.processClientLoadedAudioSource(ws.data.clientId, server);
};
