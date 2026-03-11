import type { ExtractWSRequestFrom } from "@beatsync/shared/types/WSRequest";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSetLowPassFreq: HandlerFunction<ExtractWSRequestFrom["SET_LOW_PASS_FREQ"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  room.setLowPassFreq(message.freq, server);
};
