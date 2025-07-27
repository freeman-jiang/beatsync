import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleAddYouTubeSource: HandlerFunction<
  ExtractWSRequestFrom["ADD_YOUTUBE_SOURCE"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  
  room.addYouTubeSource(message.source);
  
  // Broadcast updated YouTube sources to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_YOUTUBE_SOURCES",
        sources: room.getState().youtubeSources,
      },
    },
  });
};
