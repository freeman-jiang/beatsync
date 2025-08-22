import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleReorderAudioSources: HandlerFunction<
  ExtractWSRequestFrom["REORDER_AUDIO_SOURCES"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Handle audio source reordering
  console.log(`Reordering audio sources in room ${ws.data.roomId}`);

  const reorderedSources = room.reorderAudioSources(message.urls);

  // Broadcast the updated audio sources to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: reorderedSources },
    },
  });
};
