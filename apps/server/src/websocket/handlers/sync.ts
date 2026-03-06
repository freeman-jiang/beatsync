import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSync: HandlerFunction<ExtractWSRequestFrom["SYNC"]> = ({ ws }) => {
  // Handle sync request from new client
  const { room } = requireRoom(ws);
  room.syncClient(ws);
};
