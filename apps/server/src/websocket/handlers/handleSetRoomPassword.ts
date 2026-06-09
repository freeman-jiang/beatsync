import type { SetRoomPasswordSchema } from "@beatsync/shared/types/WSRequest";
import type { ServerWebSocket } from "bun";
import type { z } from "zod";
import { sendBroadcast } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";
import { requireRoomAdmin } from "@/websocket/middlewares";

export async function handleSetRoomPassword({
  ws,
  message,
  server,
}: {
  ws: ServerWebSocket<WSData>;
  message: z.infer<typeof SetRoomPasswordSchema>;
  server: BunServer;
}) {
  const { room } = requireRoomAdmin(ws);

  await room.setRoomPassword(message.password);

  const isPrivate = room.getIsPrivate();
  console.log(`Room ${ws.data.roomId}: password ${isPrivate ? "enabled" : "disabled"} by ${ws.data.username}`);

  // Notify all connected clients about the privacy change
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "ROOM_PRIVACY_CHANGED",
        isPrivate,
      },
    },
  });
}
