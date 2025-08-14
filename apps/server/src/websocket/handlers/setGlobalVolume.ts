import { ExtractWSRequestFrom } from "@beatsync/shared/types/WSRequest";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetGlobalVolume: HandlerFunction<
  ExtractWSRequestFrom["SET_GLOBAL_VOLUME"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Set the global volume
  room.setGlobalVolume(message.volume, server);
};
