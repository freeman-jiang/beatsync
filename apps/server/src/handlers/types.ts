import type { WSRequestType, ClientActionEnum, ExtractWSRequestFrom } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import type { BunServer, WSData } from "@/utils/websocket";
import type { z } from "zod";

// Base handler function type
export type HandlerFunction<T = WSRequestType> = (data: {
  ws: ServerWebSocket<WSData>;
  message: T;
  server: BunServer;
}) => Promise<void>;

// Handler definition map type
export type HandlerDefinitions = {
  [ClientAction in z.infer<typeof ClientActionEnum>]: {
    handler: HandlerFunction<ExtractWSRequestFrom[ClientAction]>;
    description?: string;
  };
};
