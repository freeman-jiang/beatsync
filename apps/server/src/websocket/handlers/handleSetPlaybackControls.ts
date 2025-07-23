import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoomAdmin } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetPlaybackControls: HandlerFunction<
  ExtractWSRequestFrom["SET_PLAYBACK_CONTROLS"]
> = async ({ ws, message }) => {
  const { room } = requireRoomAdmin(ws);
  room.setPlaybackControls(message.permissions);
};
