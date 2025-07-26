import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleReorderClient: HandlerFunction<
  ExtractWSRequestFrom["REORDER_CLIENT"]
> = async ({ ws, message, server }) => {
  // Handle client reordering
  const { room } = requireCanMutate(ws);

  const reorderedClients = room.reorderClients(message.clientId, server);

  // Broadcast the updated client order to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "CLIENT_CHANGE",
        clients: reorderedClients,
      },
    },
  });
};
