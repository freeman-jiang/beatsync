import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleMoveClient: HandlerFunction<
  ExtractWSRequestFrom["MOVE_CLIENT"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);
  room.moveClient(message.clientId, message.position, server);
  room.broadcastStateUpdate({ server });
};
