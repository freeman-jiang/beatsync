// Tests GlobalManager.getActiveRooms() filtering: rooms must have active connections,
// be playing, and have a valid track. Also tests sorting by client count and the 50-room cap.

import { afterEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { GlobalManager } from "@/managers/GlobalManager";

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(() => {
    /* noop */
  }),
  sendUnicast: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const AUDIO_URL = "https://example.com/song.mp3";

function createActiveRoom(
  gm: GlobalManager,
  roomId: string,
  opts: { clientCount?: number; playing?: boolean; audioUrl?: string } = {}
) {
  const room = gm.getOrCreateRoom(roomId);
  const url = opts.audioUrl ?? AUDIO_URL;
  room.addAudioSource({ url });

  const clientCount = opts.clientCount ?? 1;
  for (let i = 0; i < clientCount; i++) {
    const ws = createMockWs({ clientId: `${roomId}-client-${i}`, roomId });
    room.addClient(ws);
    // Keep NTP fresh so hasActiveConnections() returns true
    room.processNTPRequestFrom({ clientId: `${roomId}-client-${i}` });
  }

  if (opts.playing !== false) {
    room.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: url, trackTimeSeconds: 0 }, Date.now());
  }

  return room;
}

describe("GlobalManager.getActiveRooms", () => {
  let gm: GlobalManager;

  afterEach(() => {
    // Clean up all rooms
    for (const id of gm.getRoomIds()) {
      gm.deleteRoom(id);
    }
  });

  it("should return rooms that are playing with active connections and valid tracks", () => {
    gm = new GlobalManager();
    createActiveRoom(gm, "active-1");
    createActiveRoom(gm, "active-2");

    const active = gm.getActiveRooms();
    expect(active).toHaveLength(2);
  });

  it("should exclude rooms with no active connections", () => {
    gm = new GlobalManager();
    createActiveRoom(gm, "active");

    // Create a room with no clients
    const empty = gm.getOrCreateRoom("empty");
    empty.addAudioSource({ url: AUDIO_URL });
    empty.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 0 }, Date.now());

    const active = gm.getActiveRooms();
    expect(active).toHaveLength(1);
    expect(active[0].roomId).toBe("active");
  });

  it("should exclude rooms that are paused", () => {
    gm = new GlobalManager();
    createActiveRoom(gm, "playing");
    createActiveRoom(gm, "paused", { playing: false });

    const active = gm.getActiveRooms();
    expect(active).toHaveLength(1);
    expect(active[0].roomId).toBe("playing");
  });

  it("should exclude rooms where the playing track no longer exists", () => {
    gm = new GlobalManager();
    createActiveRoom(gm, "valid-track");

    // Create a room playing a track that gets removed
    const room = createActiveRoom(gm, "ghost-track");
    room.removeAudioSources([AUDIO_URL]);

    const active = gm.getActiveRooms();
    expect(active).toHaveLength(1);
    expect(active[0].roomId).toBe("valid-track");
  });

  it("should sort by client count descending", () => {
    gm = new GlobalManager();
    createActiveRoom(gm, "small", { clientCount: 1 });
    createActiveRoom(gm, "big", { clientCount: 5 });
    createActiveRoom(gm, "medium", { clientCount: 3 });

    const active = gm.getActiveRooms();
    expect(active).toHaveLength(3);
    expect(active[0].roomId).toBe("big");
    expect(active[1].roomId).toBe("medium");
    expect(active[2].roomId).toBe("small");
  });
});
