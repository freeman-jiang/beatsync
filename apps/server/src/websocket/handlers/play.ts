import { epochNow, ExtractWSRequestFrom } from "@beatsync/shared";
import { SCHEDULE_TIME_MS } from "../../config";
import { sendBroadcast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handlePlay: HandlerFunction<
  ExtractWSRequestFrom["PLAY"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);

  const serverTimeToExecute = epochNow() + SCHEDULE_TIME_MS;

  // Update playback state
  room.updatePlaybackSchedulePlay(message, serverTimeToExecute);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "SCHEDULED_ACTION",
      scheduledAction: message,
      serverTimeToExecute: serverTimeToExecute,
      // TODO: Make the longest RTT + some amount instead of hardcoded this breaks for long RTTs
    },
  });
};
