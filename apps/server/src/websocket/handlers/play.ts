import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handlePlay: HandlerFunction<ExtractWSRequestFrom["PLAY"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Initiate audio loading for all clients
  // The play will be executed after all clients load or timeout
  room.initiateAudioSourceLoad(message, ws.data.clientId, server);
};
