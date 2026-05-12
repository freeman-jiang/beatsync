import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { MAIN_CONTEXT_ID } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

/**
 * SET_CONTEXT_LOOP: admin toggles whether a playlist loops at the end of its
 * current track. Broadcasts CONTEXT_LOOP_UPDATE so every client mirrors the
 * new flag immediately — the next time an audio source starts, it will respect
 * the latest loop value.
 */
export const handleSetContextLoop: HandlerFunction<ExtractWSRequestFrom["SET_CONTEXT_LOOP"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  const contextId = message.contextId ?? MAIN_CONTEXT_ID;
  if (!room.setContextLoop(contextId, message.loop)) {
    console.warn(`SET_CONTEXT_LOOP for unknown context ${contextId} in room ${room.getRoomId()}`);
    return;
  }
  sendBroadcast({
    server,
    roomId: room.getRoomId(),
    message: {
      type: "ROOM_EVENT",
      event: { type: "CONTEXT_LOOP_UPDATE", contextId, loop: message.loop },
    },
  });
};
