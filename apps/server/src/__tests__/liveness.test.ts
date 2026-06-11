import { afterEach, beforeEach, describe, expect, it, type Mock } from "bun:test";
import sinon from "sinon";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { CLEANUP_DELAY_MS, globalManager } from "@/managers/GlobalManager";
import { RoomManager } from "@/managers/RoomManager";
import { handleMessage } from "@/routes/websocketHandlers";

mockR2();

// Liveness policy under test:
// - silent > PING_AFTER_MS -> server sends a PING (clients answer from onmessage,
//   which browsers do NOT throttle in background tabs, unlike timers)
// - silent > REAP_AFTER_MS -> connection is considered dead: terminate + remove
const PING_AFTER_MS = RoomManager.LIVENESS_PING_AFTER_MS;
const REAP_AFTER_MS = RoomManager.LIVENESS_REAP_AFTER_MS;

const sentPings = (ws: ReturnType<typeof createMockWs>): number =>
  (ws.send as unknown as Mock<(data: string) => number>).mock.calls.filter(
    (call) => (JSON.parse(call[0]) as { type: string }).type === "LIVENESS_PING"
  ).length;

const terminateCalls = (ws: ReturnType<typeof createMockWs>): number =>
  (ws.terminate as Mock<() => void>).mock.calls.length;

describe("Client Liveness (ping/pong)", () => {
  let clock: sinon.SinonFakeTimers;
  const server = createMockServer();

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      globalManager.deleteRoom(roomId);
    }
  });

  afterEach(() => {
    clock.restore();
  });

  it("pings a silent client after the ping threshold, not before", () => {
    const roomId = "ping-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const ws = createMockWs({ clientId: "quiet", roomId });
    room.addClient(ws);

    clock.tick(PING_AFTER_MS - 2_500);
    expect(sentPings(ws)).toBe(0);

    clock.tick(5_000);
    expect(sentPings(ws)).toBeGreaterThanOrEqual(1);
    // Still connected — a quiet client is questioned, not kicked
    expect(room.getClients().length).toBe(1);
  });

  it("never disconnects a client that answers pings, even when silent for minutes", async () => {
    // The minimal liveness contract: a PONG with no accompanying NTP traffic must
    // keep the client alive. Real clients piggyback an NTP probe alongside each
    // PONG, which would mask a regression that re-couples survival to NTP recency
    // (the pre-redesign behavior whose 3.75s staleness kicks caused a permanent
    // reconnect churn loop) — so this test deliberately sends pongs only.
    const roomId = "background-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const ws = createMockWs({ clientId: "backgrounded", roomId });
    room.addClient(ws);

    for (let i = 0; i < 10; i++) {
      clock.tick(20_000); // well past the old 3.75s NTP staleness window
      await handleMessage(ws, JSON.stringify({ type: "LIVENESS_PONG" }), server);
    }

    expect(room.getClients().length).toBe(1);
    expect(terminateCalls(ws)).toBe(0);
  });

  it("treats NTP requests on the fast path as liveness", async () => {
    const roomId = "ntp-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const ws = createMockWs({ clientId: "syncing", roomId });
    room.addClient(ws);

    // NTP arrives every 10s — under the ping threshold, so the client should
    // never even be pinged, let alone reaped
    for (let i = 0; i < 8; i++) {
      clock.tick(10_000);
      await handleMessage(
        ws,
        JSON.stringify({ type: "NTP_REQUEST", t0: 1, probeGroupId: i, probeGroupIndex: 0 }),
        server
      );
    }

    expect(sentPings(ws)).toBe(0);
    expect(terminateCalls(ws)).toBe(0);
    expect(room.getClients().length).toBe(1);
  });

  it("terminates a client that misses pings past the reap threshold, then cleans up the room", async () => {
    // Dead-peer regression (mock close/terminate are no-ops, so the close
    // handler never fires — the reaper must not depend on it)
    const roomId = "dead-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const ws = createMockWs({ clientId: "gone", roomId });
    room.addClient(ws);

    clock.tick(REAP_AFTER_MS + 5_000);
    expect(sentPings(ws)).toBeGreaterThanOrEqual(2); // multiple chances to answer
    expect(terminateCalls(ws)).toBe(1);
    expect(room.getClients().length).toBe(0);

    await clock.tickAsync(CLEANUP_DELAY_MS + 1_000);
    expect(globalManager.getRoom(roomId)).toBeUndefined();
  });

  it("hasActiveConnections reflects open sockets, not NTP freshness", () => {
    const roomId = "quiet-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const ws = createMockWs({ clientId: "lurker", roomId });
    room.addClient(ws);

    // Far beyond the old 3.75s NTP staleness window — still an active connection
    clock.tick(30_000);
    expect(room.hasActiveConnections()).toBe(true);

    // Once actually reaped, the room reports no active connections
    clock.tick(REAP_AFTER_MS);
    expect(room.hasActiveConnections()).toBe(false);
  });

  it("prefers a recently-active client when auto-promoting an admin", () => {
    const roomId = "promote-room";
    const room = globalManager.getOrCreateRoom(roomId);
    const admin = createMockWs({ clientId: "admin", roomId });
    const stale = createMockWs({ clientId: "stale", roomId });
    const fresh = createMockWs({ clientId: "fresh", roomId });
    room.addClient(admin); // first client becomes admin
    room.addClient(stale);
    room.addClient(fresh);

    // "stale" goes quiet for 50s (still connected, answering nothing);
    // "fresh" was just heard from
    clock.tick(50_000);
    room.markClientSeen("fresh");
    room.markClientSeen("admin");

    room.removeClient("admin");

    const clients = room.getClients();
    expect(clients.find((c) => c.clientId === "fresh")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "stale")?.isAdmin).toBe(false);
  });
});
