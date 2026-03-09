import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { IS_DEMO_MODE } from "@/demo";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handlePlay: HandlerFunction<ExtractWSRequestFrom["PLAY"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  if (IS_DEMO_MODE) {
    // Skip audio loading coordination — audio is pre-cached on clients.
    // Broadcast play immediately to avoid 3s timeout dead air on stage.
    room.executeImmediatePlay(message, server);
  } else {
    // Initiate audio loading for all clients
    // The play will be executed after all clients load or timeout
    room.initiateAudioSourceLoad(message, ws.data.clientId, server);
  }
};
