import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleStartSpatialAudio: HandlerFunction<
  ExtractWSRequestFrom["START_SPATIAL_AUDIO"]
> = async ({ ws, message, server }) => {
  // Start loop only if not already started
  const { room } = requireCanMutate(ws); // do nothing if no room exists

  room.startSpatialAudio(server);
};
