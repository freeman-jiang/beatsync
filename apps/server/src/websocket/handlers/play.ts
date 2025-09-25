import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handlePlay: HandlerFunction<
  ExtractWSRequestFrom["PLAY"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Initiate audio loading for all clients
  // The play will be executed after all clients load or timeout
  room.initiateAudioSourceLoad(message, ws.data.clientId, server);
};
