import type { WSResponseType } from "@beatsync/shared";
import { WS_RESPONSE_REGISTRY } from "@/websocket/registry";
import type { WSResponseContext } from "@/websocket/types";

/**
 * Type-safe message dispatcher (mirrors the server's dispatchMessage)
 *
 * The TypeScript compiler cannot track the relationship between a dynamic
 * property access (WS_RESPONSE_REGISTRY[response.type]) and the discriminated
 * union. This is a known limitation when using mapped types with discriminated
 * unions.
 *
 * The registry's mapped type guarantees a handler exists for every response
 * type, and the message shape matches because it passed WSResponseSchema
 * validation — so the assertion below is safe.
 */
export function dispatchWSResponse(data: { response: WSResponseType; context: WSResponseContext }): void {
  const handler = WS_RESPONSE_REGISTRY[data.response.type];

  try {
    // @ts-expect-error - response matches the handler keyed by its own type
    handler.handle(data);
  } catch (error) {
    console.error(`Websocket handler ${handler.description} threw error:`, error);
  }
}
