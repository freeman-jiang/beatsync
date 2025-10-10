import { ExtractWSRequestFrom } from "@beatsync/shared";
import { globalManager } from "../../managers";
import { sendBroadcast } from "../../utils/responses";
import { HandlerFunction } from "../types";

export const handleReorderAudioSources: HandlerFunction<
  ExtractWSRequestFrom["REORDER_AUDIO_SOURCES"]
> = async ({ ws, message, server }) => {
  const roomId = ws.data.roomId;
  const room = globalManager.getRoom(roomId);

  if (!room) {
    console.error(`ReorderAudioSources failed: Room ${roomId} not found`);
    return;
  }

  const error = room.reorderAudioSource(message.reorderedAudioSources);
  if (error) {
    console.error(`ReorderAudioSources failed: ${error.message}`);
    return;
  }

  sendBroadcast({
    server,
    roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: room.getAudioSources() },
    },
  });
}
