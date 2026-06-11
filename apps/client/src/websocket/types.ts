import type { ExtractWSResponseFrom, ServerActionEnum, WSResponseType } from "@beatsync/shared";
import type { z } from "zod";

// Connection-scoped values handlers may need beyond the store
export interface WSResponseContext {
  ws: WebSocket;
  markNTPResponseReceived: () => void;
}

// Base handler function type
export type ResponseHandlerFunction<T = WSResponseType> = (data: { response: T; context: WSResponseContext }) => void;

// Handler definition map type — exhaustive over every server -> client message
export type WebsocketResponseRegistry = {
  [ServerAction in z.infer<typeof ServerActionEnum>]: {
    handle: ResponseHandlerFunction<ExtractWSResponseFrom[ServerAction]>;
    description?: string;
  };
};
