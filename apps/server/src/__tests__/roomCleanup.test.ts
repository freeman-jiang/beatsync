import { describe, expect, it, beforeEach } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";

mockR2();

describe("Room Cleanup Timer", () => {
  beforeEach(() => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      globalManager.deleteRoom(roomId);
    }
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

  it("should cancel cleanup when client rejoins within grace period", async () => {
    const roomId = "rejoin-test";
    const room = globalManager.getOrCreateRoom(roomId);
    let cleanupCalled = false;

    room.addClient(createMockWs({ clientId: "client-1", roomId }));

    // Remove the client (room becomes empty)
    room.removeClient("client-1");

    // Schedule cleanup (simulating what handleClose does)
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      globalManager.deleteRoom(roomId);
    }, 3000); // Using 3 seconds like in websocketHandlers

    // Verify cleanup is scheduled but not called yet
    expect(cleanupCalled).toBe(false);

    room.addClient(createMockWs({ clientId: "client-2", roomId }));

    // Wait a bit to ensure cleanup would have been called if not cancelled
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Cleanup should not have been called
    expect(cleanupCalled).toBe(false);

    // Room should still exist and have the new client
    expect(room.getClients().length).toBe(1);
    expect(room.getClients()[0].clientId).toBe("client-2");
  });

  it("should execute cleanup after the specified delay", async () => {
    const room = globalManager.getOrCreateRoom("timer-test");
    let cleanupCalled = false;

    // Schedule cleanup with a very short delay
    room.scheduleCleanup(() => Promise.resolve(void (cleanupCalled = true)), 100); // 100ms delay

    // Cleanup should not be called immediately
    expect(cleanupCalled).toBe(false);

    // Wait for the timer to fire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);
  });
});
