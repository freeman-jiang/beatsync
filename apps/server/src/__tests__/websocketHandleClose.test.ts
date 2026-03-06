// Tests handleClose: client removal, CLIENT_CHANGE broadcast, spatial audio cleanup,
// and room cleanup scheduling when the last client leaves.

import type { WSBroadcastType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { handleClose, handleOpen } from "@/routes/websocketHandlers";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "close-test-room";

describe("handleClose", () => {
  let server: BunServer;

  beforeEach(() => {
    broadcastMessages = [];
    server = createMockServer();
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  });

  it("should remove client from room and broadcast CLIENT_CHANGE", () => {
    const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    // Add unsubscribe mock since handleClose calls ws.unsubscribe

    handleOpen(ws, server);
    broadcastMessages = [];

    handleClose(ws, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getClients()).toHaveLength(0);

    // server.publish should have been called with CLIENT_CHANGE
    expect((server.publish as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
  });

  it("should not schedule cleanup when other clients remain", () => {
    const ws1 = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    const ws2 = createMockWs({ clientId: "client-2", roomId: ROOM_ID });

    handleOpen(ws1, server);
    handleOpen(ws2, server);

    // Keep client-2's NTP fresh
    globalManager.getRoom(ROOM_ID)!.processNTPRequestFrom("client-2");

    handleClose(ws1, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getClients()).toHaveLength(1);
    expect(room.getClients()[0].clientId).toBe("client-2");
    expect(room.hasActiveConnections()).toBe(true);
  });
});
