import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSetListeningSource: HandlerFunction<ExtractWSRequestFrom["SET_LISTENING_SOURCE"]> = ({
  ws,
  message,
  server,
}) => {
  // Handle listening source update
  const { room } = requireCanMutate(ws);

  room.updateListeningSource(message, server);
};
