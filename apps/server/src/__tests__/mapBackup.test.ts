// End-to-end test for BackupManager: a server-wide backup that includes a map room
// should round-trip roomType, mapMetadata, and shapes through R2 (mocked) and arrive
// at the restored RoomManager intact.

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { BackupManager } from "@/managers/BackupManager";
import { globalManager } from "@/managers/GlobalManager";
import type { ServerBackupType } from "@/managers/RoomManager";

function makeShape(id: string) {
  return {
    id,
    type: "polygon",
    coordinates: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
    createdBy: "creator",
    createdAt: 1,
    loop: false,
    groupId: "g1",
    audibleRadiusMeters: 75,
  };
}

describe("BackupManager: map round-trip", () => {
  beforeEach(() => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
  });

  it("restores roomType, mapMetadata, shapes, and playlists from a backup blob", async () => {
    const backup: ServerBackupType = {
      timestamp: Date.now(),
      data: {
        rooms: {
          "map-room": {
            clientDatas: [],
            audioSources: [{ url: "https://example.com/track.mp3" }],
            globalVolume: 1,
            lowPassFreq: 20000,
            playbackState: {
              type: "paused",
              audioSource: "",
              serverTimeToExecute: 0,
              trackPositionSeconds: 0,
            },
            roomType: "map",
            mapMetadata: { center: [42.28, -83.74], zoom: 17 },
            shapes: [
              {
                shape: makeShape("s1"),
                playlist: [{ url: "https://example.com/track.mp3" }],
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

    // R2 mock: pretend the latest backup file exists and contains our payload, and that
    // every audio URL we ask about is valid (so audioSources aren't filtered out).
    mockR2({
      getLatestFileWithPrefix: mock(() => "state-backup/latest.json"),
      downloadJSON: mock(() => backup),
      validateAudioFileExists: mock(() => true),
    });

    const restored = await BackupManager.restoreState();
    expect(restored).toBe(true);

    const room = globalManager.getRoom("map-room");
    expect(room).toBeTruthy();
    expect(room!.getRoomType()).toBe("map");
    expect(room!.getMapMetadata()).toEqual({ center: [42.28, -83.74], zoom: 17 });

    const shapeStates = room!.getShapeStates();
    expect(shapeStates).toHaveLength(1);
    expect(shapeStates[0].shape.id).toBe("s1");
    expect(shapeStates[0].shape.groupId).toBe("g1");
    expect(shapeStates[0].shape.audibleRadiusMeters).toBe(75);
    expect(shapeStates[0].playlist).toEqual([{ url: "https://example.com/track.mp3" }]);
  });

  it("preserves audio-room defaults when the backup has no map fields", async () => {
    const backup: ServerBackupType = {
      timestamp: Date.now(),
      data: {
        rooms: {
          "legacy-room": {
            clientDatas: [],
            audioSources: [],
            globalVolume: 1,
            lowPassFreq: 20000,
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

    mockR2({
      getLatestFileWithPrefix: mock(() => "state-backup/latest.json"),
      downloadJSON: mock(() => backup),
      validateAudioFileExists: mock(() => true),
    });

    await BackupManager.restoreState();
    const room = globalManager.getRoom("legacy-room");
    expect(room!.getRoomType()).toBe("audio");
    expect(room!.getShapeStates()).toEqual([]);
  });
});
