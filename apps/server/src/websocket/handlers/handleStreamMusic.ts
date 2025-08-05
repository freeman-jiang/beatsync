import { ExtractWSRequestFrom } from "@beatsync/shared";
import { MUSIC_PROVIDER_MANAGER } from "../../managers/MusicProviderManager";
import { sendUnicast } from "../../utils/responses";
import { HandlerFunction } from "../types";

export const handleStreamMusic: HandlerFunction<
  ExtractWSRequestFrom["STREAM_MUSIC"]
> = async ({ ws, message }) => {
  const response = await MUSIC_PROVIDER_MANAGER.stream(message.trackId);

  sendUnicast({
    ws,
    message: {
      type: "STREAM_RESPONSE",
      response,
      trackId: message.trackId,
    },
  });
};
