import {
  WSRequestType,
  ClientActionEnum,
  ExtractWSRequestFrom,
} from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { WSData } from "../utils/websocket";
import { z } from "zod";

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
