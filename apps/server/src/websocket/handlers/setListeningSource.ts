import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetListeningSource: HandlerFunction<
  ExtractWSRequestFrom["SET_LISTENING_SOURCE"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);
  room.updateListeningSource(message, server); // handles its own broadcast
};
