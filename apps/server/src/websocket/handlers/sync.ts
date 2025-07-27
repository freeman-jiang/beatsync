import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSync: HandlerFunction<
  ExtractWSRequestFrom["SYNC"]
> = async ({ ws }) => {
  // Handle sync request from new client
  const { room } = requireRoom(ws);
  room.syncClient(ws);
};
