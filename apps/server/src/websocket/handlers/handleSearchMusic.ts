import { IS_DEMO_MODE } from "@/config";
import { MUSIC_PROVIDER_MANAGER } from "@/managers/MusicProviderManager";
import { sendUnicast } from "@/utils/responses";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleSearchMusic: HandlerFunction<ExtractWSRequestFrom["SEARCH_MUSIC"]> = async ({ ws, message }) => {
  if (IS_DEMO_MODE) return;
  try {
    const data = await MUSIC_PROVIDER_MANAGER.search(message.query, message.offset ?? 0);

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
