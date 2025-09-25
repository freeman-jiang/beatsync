import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleAudioSourceLoaded: HandlerFunction<
  ExtractWSRequestFrom["AUDIO_SOURCE_LOADED"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);

  // Process that this client has loaded the audio source
  room.processClientLoadedAudioSource(ws.data.clientId, server);
};
