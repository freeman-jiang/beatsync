// Tests for the SET_CONTEXT_LOOP handler + RoomManager.setContextLoop primitive.
//
// The loop flag lets a playlist context decide what happens when its current track
// ends. Audio rooms typically default false (sequenced playback); future map rooms
// will set true (continuous ambient zones). This commit adds the wire protocol +
// server-side state; the client engine respects the flag on subsequent plays.

import type { WSBroadcastType } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer, WSData } from "@/utils/websocket";

let broadcasts: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcasts.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(() => {
    /* noop */
  }),
  sendToClient: mock(({ ws, message }: { ws: ServerWebSocket<WSData>; message: WSBroadcastType }) => {
    ws.send(JSON.stringify(message));
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

import { handleSetContextLoop } from "@/websocket/handlers/setContextLoop";

const ROOM_ID = "loop-test";

beforeEach(() => {
  broadcasts = [];
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
});

describe("RoomManager.setContextLoop", () => {
  it("toggles the loop flag for an existing context", () => {
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    // Main context exists by default with loop=false.
    expect(room.setContextLoop("main", true)).toBe(true);
    const playlists = room.getPlaylistsView();
    const main = playlists.find((p) => p.id === "main")!;
    expect(main.loop).toBe(true);

    expect(room.setContextLoop("main", false)).toBe(true);
    expect(room.getPlaylistsView().find((p) => p.id === "main")?.loop).toBe(false);
  });

  it("returns false for an unknown context", () => {
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    expect(room.setContextLoop("does-not-exist", true)).toBe(false);
  });
});

describe("handleSetContextLoop", () => {
  it("admin can toggle loop; broadcasts CONTEXT_LOOP_UPDATE", () => {
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    const adminWs = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    room.addClient(adminWs);

    void handleSetContextLoop({
      ws: adminWs,
      message: { type: "SET_CONTEXT_LOOP", loop: true },
      server: createMockServer(),
    });

    const updates = broadcasts.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "CONTEXT_LOOP_UPDATE"
    );
    expect(updates).toHaveLength(1);
    const ev = updates[0].message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
    if (ev.event.type !== "CONTEXT_LOOP_UPDATE") throw new Error("unreachable");
    expect(ev.event.contextId).toBe("main");
    expect(ev.event.loop).toBe(true);
    expect(room.getPlaylistsView().find((p) => p.id === "main")?.loop).toBe(true);
  });

  it("non-admin in ADMIN_ONLY rooms is rejected (no broadcast)", () => {
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    const admin = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    const visitor = createMockWs({ clientId: "visitor", roomId: ROOM_ID });
    room.addClient(admin);
    room.addClient(visitor);

    expect(() =>
      handleSetContextLoop({
        ws: visitor,
        message: { type: "SET_CONTEXT_LOOP", loop: true },
        server: createMockServer(),
      })
    ).toThrow(/permission/);
    expect(broadcasts).toHaveLength(0);
    expect(room.getPlaylistsView().find((p) => p.id === "main")?.loop).toBe(false);
  });

  it("unknown context does nothing (no broadcast, no error)", () => {
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    const admin = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    room.addClient(admin);

    void handleSetContextLoop({
      ws: admin,
      message: { type: "SET_CONTEXT_LOOP", loop: true, contextId: "ghost" },
      server: createMockServer(),
    });

    expect(broadcasts).toHaveLength(0);
  });
});
