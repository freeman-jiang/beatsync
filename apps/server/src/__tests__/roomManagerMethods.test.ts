// Tests for RoomManager methods not covered by other test files: NTP/RTT processing,
// playback state scheduling, syncClient late-join math, and audio source reordering.

import type { WSBroadcastType, WSUnicastType } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { RoomManager } from "@/managers/RoomManager";
import type { BunServer, WSData } from "@/utils/websocket";

let unicastMessages: { ws: ServerWebSocket<WSData>; message: WSUnicastType }[] = [];
let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(({ ws, message }: { ws: ServerWebSocket<WSData>; message: WSUnicastType }) => {
    unicastMessages.push({ ws, message });
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "test-room";
const AUDIO_URL = "https://example.com/song.mp3";

function createRoomWithClients(count: number): { room: RoomManager; sockets: ServerWebSocket<WSData>[] } {
  const room = new RoomManager(ROOM_ID);
  room.addAudioSource({ url: AUDIO_URL });
  const sockets: ServerWebSocket<WSData>[] = [];
  for (let i = 1; i <= count; i++) {
    const ws = createMockWs({ clientId: `client-${i}` });
    room.addClient(ws);
    sockets.push(ws);
  }
  return { room, sockets };
}

describe("processNTPRequestFrom", () => {
  it("should update lastNtpResponse timestamp", () => {
    const { room } = createRoomWithClients(1);
    const before = Date.now();

    room.processNTPRequestFrom({ clientId: "client-1" });

    const client = room.getClient("client-1")!;
    expect(client.lastNtpResponse).toBeGreaterThanOrEqual(before);
  });

  it("should set RTT directly on first measurement", () => {
    const { room } = createRoomWithClients(1);

    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 100 });

    const client = room.getClient("client-1")!;
    expect(client.rtt).toBe(100);
  });

  it("should apply exponential moving average on subsequent RTT measurements", () => {
    const { room } = createRoomWithClients(1);

    // First measurement: sets RTT directly
    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 100 });
    expect(room.getClient("client-1")!.rtt).toBe(100);

    // Second measurement: EMA with alpha=0.2
    // newRTT = 100 * 0.8 + 200 * 0.2 = 80 + 40 = 120
    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 200 });
    expect(room.getClient("client-1")!.rtt).toBeCloseTo(120, 5);

    // Third measurement
    // newRTT = 120 * 0.8 + 50 * 0.2 = 96 + 10 = 106
    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 50 });
    expect(room.getClient("client-1")!.rtt).toBeCloseTo(106, 5);
  });

  it("should ignore RTT of zero or negative", () => {
    const { room } = createRoomWithClients(1);

    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 100 });
    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 0 });
    expect(room.getClient("client-1")!.rtt).toBe(100);

    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: -50 });
    expect(room.getClient("client-1")!.rtt).toBe(100);
  });
});

describe("getMaxClientRTT", () => {
  it("should return the highest RTT among clients", () => {
    const { room } = createRoomWithClients(4);

    room.processNTPRequestFrom({ clientId: "client-1", clientRTT: 50 });
    room.processNTPRequestFrom({ clientId: "client-2", clientRTT: 200 });
    room.processNTPRequestFrom({ clientId: "client-3", clientRTT: 150 });
    room.processNTPRequestFrom({ clientId: "client-4", clientRTT: 80 });

    expect(room.getMaxClientRTT()).toBe(200);
  });
});

describe("updatePlaybackSchedulePlay", () => {
  it("should update playback state to playing for a valid track", () => {
    const { room } = createRoomWithClients(1);

    const result = room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 30 },
      1000
    );

    expect(result).toBe(true);
    const state = room.getPlaybackState();
    expect(state.type).toBe("playing");
    expect(state.audioSource).toBe(AUDIO_URL);
    expect(state.trackPositionSeconds).toBe(30);
    expect(state.serverTimeToExecute).toBe(1000);
  });

  it("should reject play for a nonexistent track", () => {
    const { room } = createRoomWithClients(1);

    const result = room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "https://nope.com/missing.mp3", trackTimeSeconds: 0 },
      1000
    );

    expect(result).toBe(false);
    expect(room.getPlaybackState().type).toBe("paused");
  });
});

describe("updatePlaybackSchedulePause", () => {
  it("should update playback state to paused for a valid track", () => {
    const { room } = createRoomWithClients(1);

    const result = room.updatePlaybackSchedulePause(
      { type: "PAUSE", audioSource: AUDIO_URL, trackTimeSeconds: 45.5 },
      2000
    );

    expect(result).toBe(true);
    const state = room.getPlaybackState();
    expect(state.type).toBe("paused");
    expect(state.audioSource).toBe(AUDIO_URL);
    expect(state.trackPositionSeconds).toBe(45.5);
  });

  it("should reset to empty state when pausing a nonexistent track", () => {
    const { room } = createRoomWithClients(1);

    const result = room.updatePlaybackSchedulePause(
      { type: "PAUSE", audioSource: "https://nope.com/gone.mp3", trackTimeSeconds: 10 },
      2000
    );

    expect(result).toBe(false);
    const state = room.getPlaybackState();
    expect(state.type).toBe("paused");
    expect(state.audioSource).toBe("");
    expect(state.trackPositionSeconds).toBe(0);
  });
});

describe("syncClient", () => {
  beforeEach(() => {
    unicastMessages = [];
    broadcastMessages = [];
  });

  it("should do nothing when playback is paused", () => {
    const { room, sockets } = createRoomWithClients(1);

    room.syncClient(sockets[0]);

    expect(unicastMessages).toHaveLength(0);
  });

  it("should send a PLAY unicast with calculated resume position when playing", () => {
    const { room, sockets } = createRoomWithClients(1);

    // Simulate playback started 5 seconds ago at track position 10s
    const fiveSecondsAgo = Date.now() - 5000;
    room.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 10 }, fiveSecondsAgo);

    room.syncClient(sockets[0]);

    expect(unicastMessages).toHaveLength(1);
    const msg = unicastMessages[0].message;
    if (msg.type !== "SCHEDULED_ACTION" || msg.scheduledAction.type !== "PLAY") {
      throw new Error("Expected SCHEDULED_ACTION PLAY unicast");
    }

    expect(msg.scheduledAction.audioSource).toBe(AUDIO_URL);
    // Resume position should be > 10s (started at 10s, ~5s elapsed + scheduling delay)
    expect(msg.scheduledAction.trackTimeSeconds).toBeGreaterThan(10);
    // Should be roughly 10 + 5 + scheduling delay (~1.9s = 0.4s min schedule + 1.5s extra offset)
    // So somewhere around 15-20s
    expect(msg.scheduledAction.trackTimeSeconds).toBeGreaterThan(14);
    expect(msg.scheduledAction.trackTimeSeconds).toBeLessThan(25);

    // serverTimeToExecute should be in the future
    expect(msg.serverTimeToExecute).toBeGreaterThan(Date.now() - 100);
  });

  it("should account for higher RTT in sync calculation", () => {
    const { room, sockets } = createRoomWithClients(2);

    // Give client-2 a high RTT
    room.processNTPRequestFrom({ clientId: "client-2", clientRTT: 500 });

    const twoSecondsAgo = Date.now() - 2000;
    room.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 0 }, twoSecondsAgo);

    room.syncClient(sockets[0]);

    const msg = unicastMessages[0].message;
    if (msg.type !== "SCHEDULED_ACTION" || msg.scheduledAction.type !== "PLAY") {
      throw new Error("Expected SCHEDULED_ACTION PLAY unicast");
    }

    // With 500ms RTT, schedule delay = max(400, 500*1.5+200) = 950ms
    // Plus 1500ms extra offset = 2450ms total scheduling overhead
    // Track position: 0 + (2000 + 2450) / 1000 = ~4.45s
    expect(msg.scheduledAction.trackTimeSeconds).toBeGreaterThan(3);
    expect(msg.scheduledAction.trackTimeSeconds).toBeLessThan(8);
  });
});

describe("reorderAudioSource", () => {
  it("should reorder audio sources when lengths match", () => {
    const room = new RoomManager(ROOM_ID);
    const source1 = { url: "https://example.com/a.mp3" };
    const source2 = { url: "https://example.com/b.mp3" };
    const source3 = { url: "https://example.com/c.mp3" };
    room.addAudioSource(source1);
    room.addAudioSource(source2);
    room.addAudioSource(source3);

    const result = room.reorderAudioSource([source3, source1, source2]);

    expect(result).toBeUndefined();
    const sources = room.getAudioSources();
    expect(sources[0].url).toBe("https://example.com/c.mp3");
    expect(sources[1].url).toBe("https://example.com/a.mp3");
    expect(sources[2].url).toBe("https://example.com/b.mp3");
  });

  it("should return an error when lengths do not match", () => {
    const room = new RoomManager(ROOM_ID);
    room.addAudioSource({ url: "https://example.com/a.mp3" });
    room.addAudioSource({ url: "https://example.com/b.mp3" });

    const result = room.reorderAudioSource([{ url: "https://example.com/a.mp3" }]);

    expect(result).toBeInstanceOf(Error);
    // Original order should be unchanged
    expect(room.getAudioSources()).toHaveLength(2);
  });
});
