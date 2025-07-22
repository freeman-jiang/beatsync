import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleReorderClient: HandlerFunction<
  ExtractWSRequestFrom["REORDER_CLIENT"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);

  // Reorder clients (this also updates spatial audio gains)
  room.moveClientToFront(message.clientId, server);
  room.broadcastStateUpdate({ server });
};
