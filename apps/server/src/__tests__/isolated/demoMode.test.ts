// Tests demo mode constraints:
// - Minimal message passing (CLIENT_CHANGE only unicasts self, no full client list broadcast)
// - DEMO_USER_COUNT broadcasts update in real time as clients join/leave
// - Play/pause still works for admin clients
//
// IMPORTANT: This test mocks @/demo with IS_DEMO_MODE=true which affects the global
// module cache. Run this file in isolation: `bun test src/__tests__/demoMode.test.ts`

import type { WSBroadcastType, WSUnicastType } from "@beatsync/shared";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import sinon from "sinon";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { handleClose, handleMessage, handleOpen } from "@/routes/websocketHandlers";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";
import type { ServerWebSocket } from "bun";

type AnyMessage = WSBroadcastType | WSUnicastType;

let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[];
let unicastMessages: { ws: ServerWebSocket<unknown>; message: AnyMessage }[];

mockR2();

void mock.module("@/demo", () => ({
  IS_DEMO_MODE: true,
  AUDIO_FILENAMES: ["demo-track.mp3"],
  AUDIO_FILE_CACHE: new Map([["demo-track.mp3", new Uint8Array(0)]]),
  isValidAdminSecret: () => true,
}));

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendToClient: mock(({ ws, message }: { ws: ServerWebSocket<unknown>; message: AnyMessage }) => {
    unicastMessages.push({ ws, message });
  }),
  sendUnicast: mock(({ ws, message }: { ws: ServerWebSocket<unknown>; message: AnyMessage }) => {
    unicastMessages.push({ ws, message });
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "demo-test-room";
const AUDIO_URL = "/audio/demo-track.mp3";

describe("demo mode", () => {
  let server: BunServer;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    broadcastMessages = [];
    unicastMessages = [];
    server = createMockServer();
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  });

  afterEach(() => {
    clock.restore();
  });

  it("should only unicast self in CLIENT_CHANGE, never broadcast full client list", () => {
    const ws1 = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    const ws2 = createMockWs({ clientId: "client-2", roomId: ROOM_ID });

    handleOpen(ws1, server);
    handleOpen(ws2, server);

    // Flush debounce
    clock.tick(501);

    // No CLIENT_CHANGE should appear in broadcasts
    const clientChangeBroadcasts = broadcastMessages.filter(
      (m) => m.message.type === "ROOM_EVENT" && m.message.event.type === "CLIENT_CHANGE"
    );
    expect(clientChangeBroadcasts).toHaveLength(0);

    // CLIENT_CHANGE should only appear as unicasts, each with just the self entry
    const clientChangeUnicasts = unicastMessages.filter(
      (m) =>
        "type" in m.message &&
        m.message.type === "ROOM_EVENT" &&
        "event" in m.message &&
        m.message.event.type === "CLIENT_CHANGE"
    );
    expect(clientChangeUnicasts).toHaveLength(2);

    // Each CLIENT_CHANGE unicast should contain only the joining client's own data
    for (const msg of clientChangeUnicasts) {
      if (msg.message.type !== "ROOM_EVENT" || msg.message.event.type !== "CLIENT_CHANGE") continue;
      expect(msg.message.event.clients).toHaveLength(1);
    }
  });

  it("should broadcast DEMO_USER_COUNT that increments as clients join", () => {
    const clients = Array.from({ length: 5 }, (_, i) => createMockWs({ clientId: `client-${i}`, roomId: ROOM_ID }));

    for (const ws of clients) {
      handleOpen(ws, server);
    }

    // Flush debounce
    clock.tick(501);

    const countMessages = broadcastMessages.filter((m) => m.message.type === "DEMO_USER_COUNT");
    expect(countMessages.length).toBeGreaterThanOrEqual(1);

    // The last DEMO_USER_COUNT should reflect all 5 clients
    const lastCount = countMessages[countMessages.length - 1];
    if (lastCount.message.type !== "DEMO_USER_COUNT") throw new Error("wrong type");
    expect(lastCount.message.count).toBe(5);
  });

  it("should broadcast DEMO_USER_COUNT that decrements as clients leave", () => {
    const clients = Array.from({ length: 5 }, (_, i) => createMockWs({ clientId: `client-${i}`, roomId: ROOM_ID }));

    for (const ws of clients) {
      handleOpen(ws, server);
    }
    clock.tick(501);
    broadcastMessages = [];

    // Disconnect 2 clients
    handleClose(clients[0], server);
    handleClose(clients[1], server);
    clock.tick(501);

    const countMessages = broadcastMessages.filter((m) => m.message.type === "DEMO_USER_COUNT");
    expect(countMessages.length).toBeGreaterThanOrEqual(1);

    const lastCount = countMessages[countMessages.length - 1];
    if (lastCount.message.type !== "DEMO_USER_COUNT") throw new Error("wrong type");
    expect(lastCount.message.count).toBe(3);
  });

  it("should allow admin to play and broadcast SCHEDULED_ACTION immediately", async () => {
    const adminWs = createMockWs({ clientId: "admin-1", roomId: ROOM_ID });
    (adminWs.data as { isAdmin: boolean }).isAdmin = true;

    handleOpen(adminWs, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    room.addAudioSource({ url: AUDIO_URL });

    broadcastMessages = [];

    await handleMessage(adminWs, JSON.stringify({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 0 }), server);

    // In demo mode, play is immediate (no audio loading coordination)
    const playBroadcast = broadcastMessages.find(
      (m) => m.message.type === "SCHEDULED_ACTION" && m.message.scheduledAction.type === "PLAY"
    );
    expect(playBroadcast).toBeDefined();
  });

  it("should allow admin to pause and broadcast SCHEDULED_ACTION", async () => {
    const adminWs = createMockWs({ clientId: "admin-1", roomId: ROOM_ID });
    (adminWs.data as { isAdmin: boolean }).isAdmin = true;

    handleOpen(adminWs, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    room.addAudioSource({ url: AUDIO_URL });
    room.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 0 }, Date.now());

    broadcastMessages = [];

    await handleMessage(
      adminWs,
      JSON.stringify({ type: "PAUSE", audioSource: AUDIO_URL, trackTimeSeconds: 10 }),
      server
    );

    const pauseBroadcast = broadcastMessages.find(
      (m) => m.message.type === "SCHEDULED_ACTION" && m.message.scheduledAction.type === "PAUSE"
    );
    expect(pauseBroadcast).toBeDefined();
    expect(room.getPlaybackState().type).toBe("paused");
  });

  it("should coalesce rapid joins into a single DEMO_USER_COUNT broadcast", () => {
    const clients = Array.from({ length: 5 }, (_, i) => createMockWs({ clientId: `client-${i}`, roomId: ROOM_ID }));

    for (const ws of clients) {
      handleOpen(ws, server);
    }

    // Before debounce fires
    const countBeforeDebounce = broadcastMessages.filter((m) => m.message.type === "DEMO_USER_COUNT");
    expect(countBeforeDebounce).toHaveLength(0);

    // Flush debounce
    clock.tick(501);

    // Should be exactly 1 coalesced broadcast
    const countMessages = broadcastMessages.filter((m) => m.message.type === "DEMO_USER_COUNT");
    expect(countMessages).toHaveLength(1);

    if (countMessages[0].message.type !== "DEMO_USER_COUNT") throw new Error("wrong type");
    expect(countMessages[0].message.count).toBe(5);
  });
});
