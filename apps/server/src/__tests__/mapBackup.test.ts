// End-to-end test for BackupManager: a backup blob containing a map room
// should round-trip its roomType + mapMetadata + shapes (and the matching
// playlist contexts) through the restore flow.

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { BackupManager } from "@/managers/BackupManager";
import { globalManager } from "@/managers/GlobalManager";
import type { ServerBackupType } from "@/managers/RoomManager";

beforeEach(() => {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
});

describe("BackupManager: map round-trip", () => {
  it("restores roomType, mapMetadata, shapes, and per-context playlists", async () => {
    const backup: ServerBackupType = {
      timestamp: Date.now(),
      data: {
        rooms: {
          "map-r": {
            clientDatas: [],
            globalVolume: 1,
            lowPassFreq: 20000,
            playlists: [
              {
                id: "main",
                tracks: [],
                loop: false,
                playbackState: {
                  type: "paused",
                  audioSource: "",
                  trackIndex: 0,
                  serverTimeToExecute: 0,
                  trackPositionSeconds: 0,
                },
              },
              {
                id: "s1",
                tracks: [{ url: "https://example.com/track.mp3" }],
                loop: true,
                playbackState: {
                  type: "paused",
                  audioSource: "",
                  trackIndex: 0,
                  serverTimeToExecute: 0,
                  trackPositionSeconds: 0,
                },
              },
            ],
            roomType: "map",
            mapMetadata: { center: [42.28, -83.74], zoom: 17 },
            shapes: [
              {
                id: "s1",
                type: "polygon",
                coordinates: [
                  [
                    [1, 2],
                    [3, 4],
                  ],
                ],
                createdBy: "creator",
                createdAt: 1,
                groupId: "g1",
                audibleRadiusMeters: 75,
              },
            ],
          },
        },
      },
    };

    mockR2({
      getLatestFileWithPrefix: mock(() => "state-backup/latest.json"),
      downloadJSON: mock(() => backup),
      validateAudioFileExists: mock(() => true),
    });

    const ok = await BackupManager.restoreState();
    expect(ok).toBe(true);

    const room = globalManager.getRoom("map-r");
    expect(room).toBeTruthy();
    expect(room!.getRoomType()).toBe("map");
    expect(room!.getMapMetadata()).toEqual({ center: [42.28, -83.74], zoom: 17 });
    expect(room!.getShape("s1")?.audibleRadiusMeters).toBe(75);
    expect(room!.getShape("s1")?.groupId).toBe("g1");
    // The shape's playlist context survived too.
    const ctx = room!.getPlaylist("s1");
    expect(ctx?.tracks).toEqual([{ url: "https://example.com/track.mp3" }]);
    expect(ctx?.loop).toBe(true);
  });

  it("legacy audio-room backups (no map fields) restore cleanly as audio rooms", async () => {
    const backup: ServerBackupType = {
      timestamp: Date.now(),
      data: {
        rooms: {
          "audio-r": {
            clientDatas: [],
            globalVolume: 1,
            lowPassFreq: 20000,
            playlists: [
              {
                id: "main",
                tracks: [],
                loop: false,
                playbackState: {
                  type: "paused",
                  audioSource: "",
                  trackIndex: 0,
                  serverTimeToExecute: 0,
                  trackPositionSeconds: 0,
                },
              },
            ],
          },
        },
      },
    };

    mockR2({
      getLatestFileWithPrefix: mock(() => "state-backup/latest.json"),
      downloadJSON: mock(() => backup),
      validateAudioFileExists: mock(() => true),
    });

    await BackupManager.restoreState();
    const room = globalManager.getRoom("audio-r");
    expect(room!.getRoomType()).toBe("audio");
    expect(room!.getShapes()).toEqual([]);
  });
});
