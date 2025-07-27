import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetSelectedYouTube: HandlerFunction<
  ExtractWSRequestFrom["SET_SELECTED_YOUTUBE"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  
  room.setSelectedYouTube(message.videoId);
  
  // Broadcast selected YouTube change to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_SELECTED_YOUTUBE",
        videoId: message.videoId,
      },
    },
  });
};
