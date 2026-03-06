import type { ExtractWSRequestFrom } from "@beatsync/shared/types/WSRequest";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSetGlobalVolume: HandlerFunction<ExtractWSRequestFrom["SET_GLOBAL_VOLUME"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

  // Set the global volume
  room.setGlobalVolume(message.volume, server);
};
