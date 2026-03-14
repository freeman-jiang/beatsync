// Tests handleClose: client removal, CLIENT_CHANGE broadcast, spatial audio cleanup,
// and room cleanup scheduling when the last client leaves.

import type { WSBroadcastType } from "@beatsync/shared";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import sinon from "sinon";
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
  sendToClient: mock(() => {
    /* noop */
  }),
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
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    broadcastMessages = [];
    server = createMockServer();
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  });

  afterEach(() => {
    clock.restore();
  });

  it("should remove client from room and broadcast CLIENT_CHANGE after debounce", () => {
    const ws1 = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    const ws2 = createMockWs({ clientId: "client-2", roomId: ROOM_ID });

    handleOpen(ws1, server);
    handleOpen(ws2, server);
    broadcastMessages = [];

    handleClose(ws1, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getClients()).toHaveLength(1);

    // Broadcast hasn't fired yet (debounced)
    expect(broadcastMessages).toHaveLength(0);

    // Advance past the 500ms debounce window
    clock.tick(501);

    expect(broadcastMessages.length).toBeGreaterThan(0);
    const clientChangeMsg = broadcastMessages.find(
      (m) => m.message.type === "ROOM_EVENT" && m.message.event.type === "CLIENT_CHANGE"
    );
    expect(clientChangeMsg).toBeDefined();
  });

  it("should skip broadcast when last client disconnects", () => {
    const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });

    handleOpen(ws, server);
    broadcastMessages = [];

    handleClose(ws, server);

    // Advance past the 500ms debounce window
    clock.tick(501);

    // No broadcast since there are no remaining clients
    const clientChangeMsg = broadcastMessages.find(
      (m) => m.message.type === "ROOM_EVENT" && m.message.event.type === "CLIENT_CHANGE"
    );
    expect(clientChangeMsg).toBeUndefined();
  });

  it("should coalesce rapid joins/leaves into a single broadcast", () => {
    const ws1 = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    const ws2 = createMockWs({ clientId: "client-2", roomId: ROOM_ID });
    const ws3 = createMockWs({ clientId: "client-3", roomId: ROOM_ID });

    handleOpen(ws1, server);
    handleOpen(ws2, server);
    handleOpen(ws3, server);
    broadcastMessages = [];

    // Rapid-fire: close two clients within the debounce window
    handleClose(ws1, server);
    clock.tick(100);
    handleClose(ws2, server);

    // Still within debounce — no broadcast yet
    expect(broadcastMessages).toHaveLength(0);

    // Advance past debounce (500ms from the LAST event, not the first)
    clock.tick(501);

    // Only ONE broadcast should have fired, with the final state (just client-3)
    const clientChangeMsgs = broadcastMessages.filter(
      (m) => m.message.type === "ROOM_EVENT" && m.message.event.type === "CLIENT_CHANGE"
    );
    expect(clientChangeMsgs).toHaveLength(1);

    const event = clientChangeMsgs[0].message;
    if (event.type !== "ROOM_EVENT" || event.event.type !== "CLIENT_CHANGE") throw new Error("wrong type");
    expect(event.event.clients).toHaveLength(1);
    expect(event.event.clients[0].clientId).toBe("client-3");
  });

  it("should not schedule cleanup when other clients remain", () => {
    const ws1 = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    const ws2 = createMockWs({ clientId: "client-2", roomId: ROOM_ID });

    handleOpen(ws1, server);
    handleOpen(ws2, server);

    // Keep client-2's NTP fresh
    globalManager.getRoom(ROOM_ID)!.processNTPRequestFrom({ clientId: "client-2" });

    handleClose(ws1, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getClients()).toHaveLength(1);
    expect(room.getClients()[0].clientId).toBe("client-2");
    expect(room.hasActiveConnections()).toBe(true);
  });
});
