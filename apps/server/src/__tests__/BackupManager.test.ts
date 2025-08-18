import { beforeEach, describe, expect, it, mock } from "bun:test";
import { globalManager } from "../managers/GlobalManager";

// Mock the r2 module before importing BackupManager
mock.module("../lib/r2", () => ({
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

describe("BackupManager (Simplified Tests)", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  describe("Core Functionality", () => {
    it("should use RoomManager.getBackupState method", async () => {
      // Create rooms and add data
      const room1 = globalManager.getOrCreateRoom("test-1");
      const room2 = globalManager.getOrCreateRoom("test-2");

      room1.addAudioSource({ url: "https://example.com/audio1.mp3" });
      room1.addAudioSource({ url: "https://example.com/audio2.mp3" });
      room2.addAudioSource({ url: "https://example.com/audio3.mp3" });

      // Get backup state from rooms
      const room1Backup = room1.createBackup();
      const room2Backup = room2.createBackup();

      // Verify the structure matches what BackupManager expects
      expect(room1Backup).toMatchObject({
        clientDatas: [],
        audioSources: [
          { url: "https://example.com/audio1.mp3" },
          { url: "https://example.com/audio2.mp3" },
        ],
        globalVolume: 1,
      });

      expect(room2Backup).toMatchObject({
        clientDatas: [],
        audioSources: [{ url: "https://example.com/audio3.mp3" }],
        globalVolume: 1,
      });
    });

    it("should restore rooms and audio sources correctly", async () => {
      // Create initial state
      const room = globalManager.getOrCreateRoom("restore-test");
      room.addAudioSource({ url: "https://example.com/restore1.mp3" });
      room.addAudioSource({ url: "https://example.com/restore2.mp3" });

      // Get the backup state
      const backupState = room.createBackup();

      // Clear the room
      await globalManager.deleteRoom("restore-test");
      expect(globalManager.hasRoom("restore-test")).toBe(false);

      // Manually restore (simulating what BackupManager.restoreState does)
      const restoredRoom = globalManager.getOrCreateRoom("restore-test");
      backupState.audioSources.forEach((source) => {
        restoredRoom.addAudioSource(source);
      });

      // Verify restoration
      const restoredState = restoredRoom.getState();
      expect(restoredState.audioSources).toHaveLength(2);
      expect(restoredState.audioSources[0].url).toBe(
        "https://example.com/restore1.mp3"
      );
      expect(restoredState.audioSources[1].url).toBe(
        "https://example.com/restore2.mp3"
      );
    });

    it("should handle empty rooms correctly", async () => {
      const emptyRoom = globalManager.getOrCreateRoom("empty-room");
      const backupState = emptyRoom.createBackup();

      expect(backupState).toMatchObject({
        clientDatas: [],
        audioSources: [],
        globalVolume: 1,
      });
    });
  });

  describe("Zod Schema Validation", () => {
    it("should validate backup data structure", async () => {
      // Create a room with data
      const room = globalManager.getOrCreateRoom("validation-test");
      room.addAudioSource({ url: "https://example.com/test.mp3" });

      const backupState = room.createBackup();

      // Verify the structure matches our schema expectations
      expect(backupState).toHaveProperty("clientDatas");
      expect(backupState).toHaveProperty("audioSources");
      expect(backupState).toHaveProperty("globalVolume");
      expect(Array.isArray(backupState.clientDatas)).toBe(true);
      expect(Array.isArray(backupState.audioSources)).toBe(true);
      expect(backupState.globalVolume).toBe(1);

      // Each audio source should have a url property
      backupState.audioSources.forEach((source) => {
        expect(source).toHaveProperty("url");
        expect(typeof source.url).toBe("string");
      });
    });
  });

  describe("RoomManager Integration", () => {
    it("should collect backup state from all rooms", async () => {
      // Create multiple rooms
      const rooms = {
        "room-a": globalManager.getOrCreateRoom("room-a"),
        "room-b": globalManager.getOrCreateRoom("room-b"),
        "room-c": globalManager.getOrCreateRoom("room-c"),
      };

      // Add different data to each room
      rooms["room-a"].addAudioSource({ url: "https://example.com/a.mp3" });
      rooms["room-b"].addAudioSource({ url: "https://example.com/b.mp3" });
      // room-c is left empty

      // Collect backup states (like BackupManager does)
      const backupData: Record<string, any> = {};
      globalManager.forEachRoom((room, roomId) => {
        backupData[roomId] = room.createBackup();
      });

      // Verify all rooms are captured
      expect(Object.keys(backupData)).toHaveLength(3);
      expect(backupData["room-a"].audioSources).toHaveLength(1);
      expect(backupData["room-b"].audioSources).toHaveLength(1);
      expect(backupData["room-c"].audioSources).toHaveLength(0);
    });
  });
});
