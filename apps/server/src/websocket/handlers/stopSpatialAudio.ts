import {
  ExtractWSRequestFrom,
  WSBroadcastType,
  epochNow,
} from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleStopSpatialAudio: HandlerFunction<
  ExtractWSRequestFrom["STOP_SPATIAL_AUDIO"]
> = async ({ ws, server }) => {
  const { room } = requireRoom(ws);
  room.stopSpatialAudio();

  // Send scheduled action to reset gains immediately
  const broadcastMessage: WSBroadcastType = {
    type: "SCHEDULED_ACTION",
    scheduledAction: {
      type: "STOP_SPATIAL_AUDIO",
    },
    serverTimeToExecute: epochNow() + 0,
  };
  sendBroadcast({ server, roomId: ws.data.roomId, message: broadcastMessage });
};
