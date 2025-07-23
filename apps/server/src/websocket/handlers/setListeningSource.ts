import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetListeningSource: HandlerFunction<
  ExtractWSRequestFrom["SET_LISTENING_SOURCE"]
> = async ({ ws, message, server }) => {
  // Handle listening source update
  const { room } = requireRoom(ws);

  room.updateListeningSource(message, server);
};
