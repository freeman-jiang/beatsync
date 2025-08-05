import { ExtractWSRequestFrom } from "@beatsync/shared";
import { MUSIC_PROVIDER_MANAGER } from "../../managers/MusicProviderManager";
import { sendUnicast } from "../../utils/responses";
import { HandlerFunction } from "../types";

export const handleSearchMusic: HandlerFunction<
  ExtractWSRequestFrom["SEARCH_MUSIC"]
> = async ({ ws, message }) => {
  const response = await MUSIC_PROVIDER_MANAGER.search(message.query);

  sendUnicast({
    ws,
    message: {
      type: "SEARCH_RESPONSE",
      response,
    },
  });
};
