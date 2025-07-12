import { describe, expect, it, beforeEach, mock } from "bun:test";
import { RoomManager } from "../managers/RoomManager";
import { globalManager } from "../managers/GlobalManager";

// Mock the deleteObjectsWithPrefix to avoid R2 calls
mock.module("../lib/r2", () => ({
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  uploadJSON: mock(async () => {}),
  downloadJSON: mock(async () => null),
  getLatestFileWithPrefix: mock(async () => null),
  getSortedFilesWithPrefix: mock(async () => []),
  deleteObject: mock(async () => {}),
  validateAudioFileExists: mock(async () => true), // Mock to always return true for tests
  cleanupOrphanedRooms: mock(async () => ({
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
  })),
}));

describe("Room Cleanup Timer", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("should schedule cleanup when room becomes empty", () => {
    const room = globalManager.getOrCreateRoom("cleanup-test");
    let cleanupCalled = false;

    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 60000);

    // Cleanup should not be called immediately
    expect(cleanupCalled).toBe(false);
  });

  it("should cancel cleanup when new client joins", () => {
    const room = globalManager.getOrCreateRoom("cancel-test");
    let cleanupCalled = false;

    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 60000);

    // Mock adding a client (which should cancel cleanup)
    const mockWs = {
      data: {
        username: "testuser",
        clientId: "client-123",
        roomId: "cancel-test",
      },
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };

    room.addClient(mockWs as any);

    // Cleanup should have been cancelled
    expect(cleanupCalled).toBe(false);
  });

  it("should replace cleanup timer when scheduled multiple times", () => {
    const room = globalManager.getOrCreateRoom("replace-test");
    let firstCleanupCalled = false;
    let secondCleanupCalled = false;

    room.scheduleCleanup(async () => {
      firstCleanupCalled = true;
    }, 60000);

    // Schedule another cleanup (should cancel the first)
    room.scheduleCleanup(async () => {
      secondCleanupCalled = true;
    }, 60000);

    // First cleanup should never be called
    expect(firstCleanupCalled).toBe(false);
    expect(secondCleanupCalled).toBe(false);
  });

  it("should cancel cleanup timer when room is cleaned up", async () => {
    const room = globalManager.getOrCreateRoom("cleanup-cancel-test");
    let cleanupCalled = false;

    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 60000);

    // Manually clean up the room
    await room.cleanup();

    // The scheduled cleanup should have been cancelled
    expect(cleanupCalled).toBe(false);
  });

  it("should cancel cleanup when client rejoins within grace period", async () => {
    const roomId = "rejoin-test";
    const room = globalManager.getOrCreateRoom(roomId);
    let cleanupCalled = false;

    // Add a client
    const mockWs1 = {
      data: {
        username: "user1",
        clientId: "client-1",
        roomId: roomId,
      },
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };
    room.addClient(mockWs1 as any);

    // Remove the client (room becomes empty)
    room.removeClient("client-1");

    // Schedule cleanup (simulating what handleClose does)
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      await globalManager.deleteRoom(roomId);
    }, 3000); // Using 3 seconds like in websocketHandlers

    // Verify cleanup is scheduled but not called yet
    expect(cleanupCalled).toBe(false);

    // Add a new client before cleanup executes
    const mockWs2 = {
      data: {
        username: "user2",
        clientId: "client-2",
        roomId: roomId,
      },
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };
    room.addClient(mockWs2 as any);

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
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 100); // 100ms delay

    // Cleanup should not be called immediately
    expect(cleanupCalled).toBe(false);

    // Wait for the timer to fire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);
  });
});
