import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import sinon from "sinon";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { BackupManager } from "@/managers/BackupManager";
import { globalManager } from "@/managers/GlobalManager";

mockR2({
  downloadJSON: mock(() => ({
    timestamp: Date.now() - 60000,
    data: {
      rooms: {
        "test-room-1": {
          clientDatas: [
            {
              clientId: "ghost-1",
              username: "user1",
              isAdmin: false,
              joinedAt: Date.now(),
              rtt: 0,
              position: { x: 0, y: 0 },
              lastNtpResponse: Date.now(),
            },
          ],
          audioSources: [{ url: "test.mp3" }],
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
  })),
  getLatestFileWithPrefix: mock(() => "state-backup/backup-test.json"),
});

describe("Restore Cleanup", () => {
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

  it("should schedule cleanup for restored rooms with no active connections", async () => {
    // Spy on room cleanup scheduling
    globalManager.getOrCreateRoom("test").scheduleCleanup = function (_callback, _delay) {
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

  it("should cancel cleanup when a real client connects to restored room", async () => {
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    room.scheduleCleanup(() => Promise.resolve(void (cleanupCalled = true)), 100);

    // Simulate a real client connecting
    room.addClient(createMockWs({ clientId: "real-client-1", username: "realuser", roomId: "test-room-1" }));

    // Advance past the cleanup delay — it should have been cancelled
    clock.tick(150);

    expect(cleanupCalled).toBe(false);
    expect(room.hasActiveConnections()).toBe(true);
  });

  it("should execute cleanup for abandoned restored rooms", async () => {
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      globalManager.deleteRoom("test-room-1");
    }, 100);

    clock.tick(101);
    // Flush microtasks so the async cleanup callback resolves
    await clock.tickAsync(0);

    expect(cleanupCalled).toBe(true);
    expect(globalManager.hasRoom("test-room-1")).toBe(false);
  });

  it("should handle ghost clients correctly", () => {
    const room = globalManager.getOrCreateRoom("ghost-room");

    const ghostClient = {
      username: "ghost",
      clientId: "ghost-1",
      ws: null,
      rtt: 0,
      position: { x: 0, y: 0 },
    };

    (room as unknown as { clientData: Map<string, typeof ghostClient> }).clientData.set("ghost-1", ghostClient);

    expect(room.getClients().length).toBe(0);
    expect(room.hasActiveConnections()).toBe(false);
  });
});
