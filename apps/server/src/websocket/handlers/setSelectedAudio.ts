import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetSelectedAudio: HandlerFunction<
  ExtractWSRequestFrom["SET_SELECTED_AUDIO"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  
  room.setSelectedAudio(message.audioUrl);
  
  // Broadcast selected audio change to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_SELECTED_AUDIO",
        audioUrl: message.audioUrl,
      },
    },
  });
};
