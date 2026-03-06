import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleStartSpatialAudio: HandlerFunction<ExtractWSRequestFrom["START_SPATIAL_AUDIO"]> = ({
  ws,
  server,
}) => {
  // Start loop only if not already started
  const { room } = requireCanMutate(ws); // do nothing if no room exists

  room.startSpatialAudio(server);
};
