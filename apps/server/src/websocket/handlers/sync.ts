import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleSync: HandlerFunction<ExtractWSRequestFrom["SYNC"]> = ({ ws }) => {
  const { room } = requireRoom(ws);
  room.syncClient(ws);
};
