import type { UnsendMessageSchema } from "@beatsync/shared/types/WSRequest";
import type { ServerWebSocket } from "bun";
import type { z } from "zod";
import { sendBroadcast } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";
import { requireRoom } from "@/websocket/middlewares";

export function handleUnsendMessage({
  ws,
  message,
  server,
}: {
  ws: ServerWebSocket<WSData>;
  message: z.infer<typeof UnsendMessageSchema>;
  server: BunServer;
}) {
  const { room } = requireRoom(ws);

  const deleted = room.unsendChatMessage(message.messageId, ws.data.clientId);

  if (!deleted) {
    // Message not found or the requester is not the sender — silently ignore
    console.warn(
      `Room ${ws.data.roomId}: UNSEND_MESSAGE ignored for messageId=${message.messageId} by ${ws.data.clientId}`
    );
    return;
  }

  console.log(`Room ${ws.data.roomId}: message ${message.messageId} unsent by ${ws.data.username}`);

  // Broadcast the deletion to all clients in the room
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "MESSAGE_DELETED",
        messageId: message.messageId,
      },
    },
  });
}
