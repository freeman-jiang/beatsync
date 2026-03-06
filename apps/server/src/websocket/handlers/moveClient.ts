import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleMoveClient: HandlerFunction<ExtractWSRequestFrom["MOVE_CLIENT"]> = ({ ws, message, server }) => {
  // Handle client move
  const { room } = requireRoom(ws);
  room.moveClient(message.clientId, message.position, server);
};
