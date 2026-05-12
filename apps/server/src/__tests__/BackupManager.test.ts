import { beforeEach, describe, expect, it } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { globalManager } from "@/managers/GlobalManager";
import type { RoomManager } from "@/managers/RoomManager";
import { MAIN_CONTEXT_ID } from "@beatsync/shared";

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
    it("createBackup serializes the main playlist's tracks", () => {
      const room1 = globalManager.getOrCreateRoom("test-1");
      const room2 = globalManager.getOrCreateRoom("test-2");

      room1.addAudioSource({ url: "https://example.com/audio1.mp3" });
      room1.addAudioSource({ url: "https://example.com/audio2.mp3" });
      room2.addAudioSource({ url: "https://example.com/audio3.mp3" });

      const room1Backup = room1.createBackup();
      const room2Backup = room2.createBackup();

      expect(room1Backup.clientDatas).toEqual([]);
      expect(room1Backup.globalVolume).toBe(1);
      const main1 = room1Backup.playlists.find((p) => p.id === MAIN_CONTEXT_ID);
      expect(main1?.tracks).toEqual([
        { url: "https://example.com/audio1.mp3" },
        { url: "https://example.com/audio2.mp3" },
      ]);

      const main2 = room2Backup.playlists.find((p) => p.id === MAIN_CONTEXT_ID);
      expect(main2?.tracks).toEqual([{ url: "https://example.com/audio3.mp3" }]);
    });

    it("round-trips playlists through createBackup + restorePlaylists", () => {
      const room = globalManager.getOrCreateRoom("restore-test");
      room.addAudioSource({ url: "https://example.com/restore1.mp3" });
      room.addAudioSource({ url: "https://example.com/restore2.mp3" });

      const backupState = room.createBackup();

      globalManager.deleteRoom("restore-test");
      expect(globalManager.hasRoom("restore-test")).toBe(false);

      const restoredRoom = globalManager.getOrCreateRoom("restore-test");
      restoredRoom.restorePlaylists(backupState.playlists);

      const restoredState = restoredRoom.getState();
      expect(restoredState.audioSources).toHaveLength(2);
      expect(restoredState.audioSources[0].url).toBe("https://example.com/restore1.mp3");
      expect(restoredState.audioSources[1].url).toBe("https://example.com/restore2.mp3");
    });
  });

  describe("RoomManager Integration", () => {
    it("createBackup captures every room's playlists", () => {
      const rooms = {
        "room-a": globalManager.getOrCreateRoom("room-a"),
        "room-b": globalManager.getOrCreateRoom("room-b"),
        "room-c": globalManager.getOrCreateRoom("room-c"),
      };

      rooms["room-a"].addAudioSource({ url: "https://example.com/a.mp3" });
      rooms["room-b"].addAudioSource({ url: "https://example.com/b.mp3" });
      // room-c is left empty

      const backupData: Record<string, ReturnType<RoomManager["createBackup"]>> = {};
      globalManager.forEachRoom((room, roomId) => {
        backupData[roomId] = room.createBackup();
      });

      expect(Object.keys(backupData)).toHaveLength(3);
      for (const roomId of ["room-a", "room-b", "room-c"] as const) {
        const main = backupData[roomId].playlists.find((p) => p.id === MAIN_CONTEXT_ID);
        expect(main).toBeDefined();
      }
      expect(backupData["room-a"].playlists[0].tracks).toHaveLength(1);
      expect(backupData["room-b"].playlists[0].tracks).toHaveLength(1);
      expect(backupData["room-c"].playlists[0].tracks).toHaveLength(0);
    });
  });
});
