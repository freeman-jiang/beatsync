import type { ExtractWSRequestFrom, WSRequestType } from "@beatsync/shared";
import { ClientActionEnum } from "@beatsync/shared";
import type { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import type { WSData } from "../utils/websocket";

// Base handler function type
export type HandlerFunction<T = WSRequestType> = (data: {
  ws: ServerWebSocket<WSData>;
  message: T;
  server: Server;
}) => Promise<void>;

// Handler definition map type
export type HandlerDefinitions = {
  [ClientAction in z.infer<typeof ClientActionEnum>]: {
    handler: HandlerFunction<ExtractWSRequestFrom[ClientAction]>;
    description?: string;
  };
};
