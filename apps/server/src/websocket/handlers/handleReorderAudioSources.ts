import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleReorderAudioSources: HandlerFunction<ExtractWSRequestFrom["REORDER_AUDIO_SOURCES"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

  const error = room.reorderAudioSource(message.reorderedAudioSources);
  if (error) {
    console.error(`ReorderAudioSources failed: ${error.message}`);
    return;
  }

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: room.getAudioSources() },
    },
  });
};
