import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoomAdmin } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetAdmin: HandlerFunction<
  ExtractWSRequestFrom["SET_ADMIN"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoomAdmin(ws);
  room.setAdmin({
    targetClientId: message.clientId,
    isAdmin: message.isAdmin,
  });

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
