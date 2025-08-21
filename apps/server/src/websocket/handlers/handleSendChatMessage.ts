import { SendChatMessageSchema } from "@beatsync/shared/types/WSRequest";
import { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import { sendBroadcast } from "../../utils/responses";
import { WSData } from "../../utils/websocket";
import { requireRoom } from "../middlewares";

export async function handleSendChatMessage({
  ws,
  message,
  server,
}: {
  ws: ServerWebSocket<WSData>;
  message: z.infer<typeof SendChatMessageSchema>;
  server: Server;
}) {
  const { room } = requireRoom(ws);

  try {
    const chatMessage = room.addChatMessage({
      clientId: ws.data.clientId,
      text: message.text,
    });

    // Get the newest ID after adding the message
    const newestId = room.getNewestChatId();

    // Broadcast to all clients in room
    sendBroadcast({
      server,
      roomId: ws.data.roomId,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "CHAT_UPDATE",
          messages: [chatMessage], // Single message for new chat
          isFullSync: false, // This is an incremental update
          newestId, // Latest message ID
        },
      },
    });
  } catch (error) {
    console.error(
      `Failed to send chat message in room ${ws.data.roomId}:`,
      error
    );
  }
}
