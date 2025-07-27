import { epochNow, ExtractWSRequestFrom } from "@beatsync/shared";
import { SCHEDULE_TIME_MS } from "../../config";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSeekYouTube: HandlerFunction<
  ExtractWSRequestFrom["SEEK_YOUTUBE"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  const serverTimeToExecute = epochNow() + SCHEDULE_TIME_MS;

  room.updatePlaybackScheduleSeekYouTube(message, serverTimeToExecute);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "SCHEDULED_ACTION",
      scheduledAction: message,
      serverTimeToExecute: serverTimeToExecute,
    },
  });
};
