import { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoomAdmin } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetPlaybackControls: HandlerFunction<
  ExtractWSRequestFrom["SET_PLAYBACK_CONTROLS"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoomAdmin(ws);
  room.setPlaybackControls(message.permissions);

  // Echo
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_PLAYBACK_CONTROLS",
        permissions: message.permissions,
      },
    },
  });
};
