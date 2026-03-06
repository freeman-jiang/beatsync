import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleAudioSourceLoaded: HandlerFunction<ExtractWSRequestFrom["AUDIO_SOURCE_LOADED"]> = ({
  ws,
  server,
}) => {
  const { room } = requireRoom(ws);

  // Process that this client has loaded the audio source
  room.processClientLoadedAudioSource(ws.data.clientId, server);
};
