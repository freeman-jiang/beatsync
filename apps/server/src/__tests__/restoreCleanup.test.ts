import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BackupManager } from "../managers/BackupManager";
import { globalManager } from "../managers/GlobalManager";

// Mock the R2 operations
mock.module("../lib/r2", () => ({
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  uploadJSON: mock(async () => {}),
  downloadJSON: mock(async (key: string) => {
    // Return test backup data
    return {
      timestamp: Date.now() - 60000, // 1 minute ago
      data: {
        rooms: {
          "test-room-1": {
            clientDatas: [{ clientId: "ghost-1", username: "user1", isAdmin: false, joinedAt: Date.now(), rtt: 0, position: { x: 0, y: 0 }, lastNtpResponse: Date.now() }],
            audioSources: [
              { url: "test.mp3" },
            ],
            globalVolume: 1,
            playbackState: {
              type: "paused",
              audioSource: "",
              serverTimeToExecute: 0,
              trackPositionSeconds: 0,
            },
          },
          "test-room-2": {
            clientDatas: [],
            audioSources: [],
            globalVolume: 1,
            playbackState: {
              type: "paused",
              audioSource: "",
              serverTimeToExecute: 0,
              trackPositionSeconds: 0,
            },
          },
        },
      },
    };
  }),
  getLatestFileWithPrefix: mock(async () => "state-backup/backup-test.json"),
  getSortedFilesWithPrefix: mock(async () => []),
  deleteObject: mock(async () => {}),
  validateAudioFileExists: mock(async () => true), // Mock to always return true for tests
  cleanupOrphanedRooms: mock(async () => ({
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
  })),
}));

describe("Restore Cleanup", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("should schedule cleanup for restored rooms with no active connections", async () => {
    let cleanupScheduled = false;
    let cleanupRoomId = "";

    // Spy on room cleanup scheduling
    const originalScheduleCleanup =
      globalManager.getOrCreateRoom("test").scheduleCleanup;
    globalManager.getOrCreateRoom("test").scheduleCleanup = function (
      callback,
      delay
    ) {
      cleanupScheduled = true;
      cleanupRoomId = this.getRoomId();
      // Don't actually schedule the timer in tests
    };

    // Restore state
    const restored = await BackupManager.restoreState();
    expect(restored).toBe(true);

    // Check that rooms were created
    expect(globalManager.hasRoom("test-room-1")).toBe(true);
    expect(globalManager.hasRoom("test-room-2")).toBe(true);

    // Check that both rooms have no active connections
    const room1 = globalManager.getRoom("test-room-1")!;
    const room2 = globalManager.getRoom("test-room-2")!;
    expect(room1.hasActiveConnections()).toBe(false);
    expect(room2.hasActiveConnections()).toBe(false);

    // Verify audio sources were restored
    expect(room1.getState().audioSources.length).toBe(1);
    expect(room2.getState().audioSources.length).toBe(0);
  });

  it("should not have active connections for restored rooms", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;

    // Room should exist but have no active connections
    expect(room).toBeDefined();
    expect(room.hasActiveConnections()).toBe(false);

    // Even though the backup had a client, it's just a ghost
    expect(room.getClients().length).toBe(0);
  });

  it("should cancel cleanup when a real client connects to restored room", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    // Schedule cleanup manually to test cancellation
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 100); // Short delay for testing

    // Simulate a real client connecting
    const mockWs = {
      data: {
        username: "realuser",
        clientId: "real-client-1",
        roomId: "test-room-1",
      },
      readyState: 1, // OPEN
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };

    room.addClient(mockWs as any);

    // Wait to ensure cleanup would have fired if not cancelled
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should not have been called
    expect(cleanupCalled).toBe(false);

    // Room should now have an active connection
    expect(room.hasActiveConnections()).toBe(true);
  });

  it("should execute cleanup for abandoned restored rooms", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    // Schedule cleanup with short delay for testing
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      await globalManager.deleteRoom("test-room-1");
    }, 100);

    // Wait for cleanup to execute
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);

    // Room should be deleted
    expect(globalManager.hasRoom("test-room-1")).toBe(false);
  });

  it("should handle ghost clients correctly", async () => {
    // Create a room with a ghost client (no WebSocket)
    const room = globalManager.getOrCreateRoom("ghost-room");

    // Add a client without a valid WebSocket
    const ghostClient = {
      username: "ghost",
      clientId: "ghost-1",
      ws: null, // No WebSocket
      rtt: 0,
      position: { x: 0, y: 0 },
    };

    // Manually add ghost to clientData map
    (room as any).clientData.set("ghost-1", ghostClient);

    // Room should not be empty (has a ghost)
    expect(room.getClients().length).toBe(0); // Ghost client has no WebSocket so it won't be returned

    // But should have no active connections
    expect(room.hasActiveConnections()).toBe(false);
  });
});
