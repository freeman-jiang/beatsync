import type { ExtractWSRequestFrom } from "@beatsync/shared/types/WSRequest";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSetMetronome: HandlerFunction<ExtractWSRequestFrom["SET_METRONOME"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  room.setMetronome(message.enabled, server);
};
