import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSendIp: HandlerFunction<ExtractWSRequestFrom["SEND_IP"]> = ({ ws, message, server }) => {
  const { room } = requireRoom(ws);

  room.processIP({ ws, message });

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "CLIENT_CHANGE",
        clients: room.getClients(),
      },
    },
  });
};
