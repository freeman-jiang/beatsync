import { WSRequestType } from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { WSData } from "../utils/websocket";
import { WS_REGISTRY } from "./registry";

/**
 * Type-safe message dispatcher
 *
 * The TypeScript compiler cannot track the relationship between a dynamic
 * property access (WS_REGISTRY[message.type]) and the discriminated union.
 * This is a known limitation when using mapped types with discriminated unions.
 *
 * The safest approach here is to acknowledge that we've validated the handler
 * exists and trust our registry structure.
 */
export async function dispatchMessage({
  ws,
  message,
  server,
}: {
  ws: ServerWebSocket<WSData>;
  message: WSRequestType;
  server: Server;
}): Promise<void> {
  const handler = WS_REGISTRY[message.type];

  if (!handler) {
    console.log(`UNRECOGNIZED MESSAGE: ${JSON.stringify(message)}`);
    return;
  }

  // We've validated that:
  // 1. message.type exists in our registry
  // 2. The registry maps each type to the correct handler
  // 3. The message shape matches because it passed WSRequestSchema validation
  //
  // TypeScript can't track this relationship through dynamic property access,
  // so we use a type assertion that we know is safe.

  try {
    await handler.handle({
      ws,
      // @ts-expect-error - we know the message matches the expected type for this handler
      message,
      server,
    });
  } catch (error) {
    console.error(
      `[${ws.data.roomId}] Websocket handler ${handler.description} threw error:"`,
      error
    );
  }
}
