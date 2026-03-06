import type { ServerWebSocket } from "bun";
import { mock } from "bun:test";
import type { BunServer, WSData } from "@/utils/websocket";

export function createMockWs(data: { clientId: string; username?: string; roomId?: string }): ServerWebSocket<WSData> {
  return {
    data: {
      clientId: data.clientId,
      username: data.username ?? `user-${data.clientId}`,
      roomId: data.roomId ?? "test-room",
    },
    subscribe: mock(() => {
      /* noop */
    }),
    send: mock(() => {
      /* noop */
    }),
    close: mock(() => {
      /* noop */
    }),
  } as unknown as ServerWebSocket<WSData>;
}

export function createMockServer(): BunServer {
  return {
    publish: mock(() => {
      /* noop */
    }),
  } as unknown as BunServer;
}
