import type { ClientActionEnum, ExtractWSRequestFrom, WSRequestType } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import type { z } from "zod";
import type { BunServer, WSData } from "../utils/websocket";

// Base handler function type
export type HandlerFunction<T = WSRequestType> = (data: {
  ws: ServerWebSocket<WSData>;
  message: T;
  server: BunServer;
}) => void | Promise<void>;

// Handler definition map type
export type WebsocketRegistry = {
  [ClientAction in z.infer<typeof ClientActionEnum>]: {
    handle: HandlerFunction<ExtractWSRequestFrom[ClientAction]>;
    description?: string;
  };
};
