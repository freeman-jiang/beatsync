import { ClientActionEnum, ExtractWSRequestFrom } from "@beatsync/shared";
import { MUSIC_PROVIDER_MANAGER } from "../../managers/MusicProviderManager";
import { HandlerFunction } from "../types";

export const handleStreamMusic: HandlerFunction<
  ExtractWSRequestFrom["STREAM_MUSIC"]
> = async ({ ws, message }) => {
  const stream = await MUSIC_PROVIDER_MANAGER.stream(message.trackId);

  ws.send(
    JSON.stringify({
      type: ClientActionEnum.enum.STREAM_MUSIC,
      stream,
    })
  );
};
