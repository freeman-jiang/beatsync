import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetMode: HandlerFunction<
  ExtractWSRequestFrom["SET_MODE"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  
  room.setCurrentMode(message.mode);
  
  // Broadcast mode change to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_CURRENT_MODE",
        mode: message.mode,
      },
    },
  });
};
