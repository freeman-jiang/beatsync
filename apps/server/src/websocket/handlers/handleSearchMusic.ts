import { ExtractWSRequestFrom } from "@beatsync/shared";
import { MUSIC_PROVIDER_MANAGER } from "../../managers/MusicProviderManager";
import { sendUnicast } from "../../utils/responses";
import { HandlerFunction } from "../types";

export const handleSearchMusic: HandlerFunction<
  ExtractWSRequestFrom["SEARCH_MUSIC"]
> = async ({ ws, message }) => {
  try {
    const data = await MUSIC_PROVIDER_MANAGER.search(
      message.query,
      message.offset || 0
    );

    sendUnicast({
      ws,
      message: {
        type: "SEARCH_RESPONSE",
        response: {
          type: "success",
          response: data,
        },
      },
    });
  } catch (error) {
    console.error(error);
    sendUnicast({
      ws,
      message: {
        type: "SEARCH_RESPONSE",
        response: {
          type: "error",
          message: "An error occurred while searching",
        },
      },
    });
  }
};
