import {
  ClientActionEnum,
  ExtractWSRequestFrom,
  WSRequestType,
} from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import { WSData } from "../utils/websocket";

// Base handler function type
export type HandlerFunction<T = WSRequestType> = (data: {
  ws: ServerWebSocket<WSData>;
  message: T;
  server: Server;
}) => Promise<void>;

// Handler definition map type
export type WebsocketRegistry = {
  [ClientAction in z.infer<typeof ClientActionEnum>]: {
    handle: HandlerFunction<ExtractWSRequestFrom[ClientAction]>;
    description?: string;
  };
};
