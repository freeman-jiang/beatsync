import { beforeEach, describe, expect, it } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { globalManager } from "@/managers/GlobalManager";
import type { RoomManager } from "@/managers/RoomManager";

mockR2();

describe("BackupManager (Simplified Tests)", () => {
  beforeEach(() => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      globalManager.deleteRoom(roomId);
    }
  });

  describe("Core Functionality", () => {
    it("should use RoomManager.getBackupState method", () => {
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
        audioSources: [{ url: "https://example.com/audio1.mp3" }, { url: "https://example.com/audio2.mp3" }],
        globalVolume: 1,
      });

      expect(room2Backup).toMatchObject({
        clientDatas: [],
        audioSources: [{ url: "https://example.com/audio3.mp3" }],
        globalVolume: 1,
      });
    });

    it("should restore rooms and audio sources correctly", () => {
      // Create initial state
      const room = globalManager.getOrCreateRoom("restore-test");
      room.addAudioSource({ url: "https://example.com/restore1.mp3" });
      room.addAudioSource({ url: "https://example.com/restore2.mp3" });

      // Get the backup state
      const backupState = room.createBackup();

      // Clear the room
      globalManager.deleteRoom("restore-test");
      expect(globalManager.hasRoom("restore-test")).toBe(false);

      // Manually restore (simulating what BackupManager.restoreState does)
      const restoredRoom = globalManager.getOrCreateRoom("restore-test");
      backupState.audioSources.forEach((source) => {
        restoredRoom.addAudioSource(source);
      });

      // Verify restoration
      const restoredState = restoredRoom.getState();
      expect(restoredState.audioSources).toHaveLength(2);
      expect(restoredState.audioSources[0].url).toBe("https://example.com/restore1.mp3");
      expect(restoredState.audioSources[1].url).toBe("https://example.com/restore2.mp3");
    });
  });

  describe("RoomManager Integration", () => {
    it("should collect backup state from all rooms", () => {
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
      const backupData: Record<string, ReturnType<RoomManager["createBackup"]>> = {};
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
