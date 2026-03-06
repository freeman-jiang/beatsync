import type { ExtractWSRequestFrom, WSBroadcastType } from "@beatsync/shared";
import { epochNow } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleStopSpatialAudio: HandlerFunction<ExtractWSRequestFrom["STOP_SPATIAL_AUDIO"]> = ({ ws, server }) => {
  // Stop the spatial audio interval if it exists
  const { room } = requireCanMutate(ws); // do nothing if no room exists

  // This important for
  const broadcastMessage: WSBroadcastType = {
    type: "SCHEDULED_ACTION",
    scheduledAction: {
      type: "STOP_SPATIAL_AUDIO",
    },
    serverTimeToExecute: epochNow() + 0,
  };

  // Reset all gains:
  sendBroadcast({ server, roomId: ws.data.roomId, message: broadcastMessage });

  room.stopSpatialAudio();
};
