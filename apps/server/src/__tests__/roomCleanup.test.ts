import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import sinon from "sinon";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";

mockR2();

describe("Room Cleanup Timer", () => {
  let clock: sinon.SinonFakeTimers;

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

  it("should cancel cleanup when new client joins", () => {
    const room = globalManager.getOrCreateRoom("cancel-test");
    let cleanupCalled = false;

    room.scheduleCleanup(() => Promise.resolve(void (cleanupCalled = true)), 60000);

    room.addClient(createMockWs({ clientId: "client-123", roomId: "cancel-test" }));

    // Cleanup should have been cancelled
    expect(cleanupCalled).toBe(false);
  });

  it("should replace cleanup timer when scheduled multiple times", () => {
    const room = globalManager.getOrCreateRoom("replace-test");
    let firstCleanupCalled = false;
    let secondCleanupCalled = false;

    room.scheduleCleanup(() => Promise.resolve(void (firstCleanupCalled = true)), 60000);

    // Schedule another cleanup (should cancel the first)
    room.scheduleCleanup(() => Promise.resolve(void (secondCleanupCalled = true)), 60000);

    // First cleanup should never be called
    expect(firstCleanupCalled).toBe(false);
    expect(secondCleanupCalled).toBe(false);
  });

  it("should cancel cleanup timer when room is cleaned up", async () => {
    const room = globalManager.getOrCreateRoom("cleanup-cancel-test");
    let cleanupCalled = false;

    room.scheduleCleanup(() => Promise.resolve(void (cleanupCalled = true)), 60000);

    // Manually clean up the room
    await room.cleanup();

    // The scheduled cleanup should have been cancelled
    expect(cleanupCalled).toBe(false);
  });

  it("should cancel cleanup when client rejoins within grace period", () => {
    const roomId = "rejoin-test";
    const room = globalManager.getOrCreateRoom(roomId);
    let cleanupCalled = false;

    room.addClient(createMockWs({ clientId: "client-1", roomId }));
    room.removeClient("client-1");

    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      globalManager.deleteRoom(roomId);
    }, 3000);

    expect(cleanupCalled).toBe(false);

    room.addClient(createMockWs({ clientId: "client-2", roomId }));

    // Advance past the cleanup delay — it should have been cancelled
    clock.tick(3100);

    expect(cleanupCalled).toBe(false);
    expect(room.getClients().length).toBe(1);
    expect(room.getClients()[0].clientId).toBe("client-2");
  });

  it("should execute cleanup after the specified delay", () => {
    const room = globalManager.getOrCreateRoom("timer-test");
    let cleanupCalled = false;

    room.scheduleCleanup(() => Promise.resolve(void (cleanupCalled = true)), 100);

    expect(cleanupCalled).toBe(false);

    clock.tick(101);

    expect(cleanupCalled).toBe(true);
  });
});
