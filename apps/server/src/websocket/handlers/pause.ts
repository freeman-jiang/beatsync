import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import type { HandlerFunction } from "../types";

export const handlePause: HandlerFunction<
  ExtractWSRequestFrom["PAUSE"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Use dynamic scheduling based on max client RTT
  const serverTimeToExecute = room.getScheduledExecutionTime();

  // Update playback state
  const success = room.updatePlaybackSchedulePause(
    message,
    serverTimeToExecute
  );

  if (!success) {
    // Track doesn't exist, don't broadcast the pause command
    console.warn(
      `Pause command rejected - track not in queue: ${message.audioSource}`
    );
    return;
  }

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "SCHEDULED_ACTION",
      scheduledAction: message,
      serverTimeToExecute: serverTimeToExecute,
      // Dynamic delay based on actual client RTTs
    },
  });
};
