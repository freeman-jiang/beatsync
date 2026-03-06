// Tests the audio loading state machine in RoomManager: the flow from play request → LOAD_AUDIO_SOURCE broadcast →
// clients reporting loaded → synchronized SCHEDULED_ACTION play. Covers happy path, timeouts, client disconnects
// mid-load, double-initiation, track removal during loading, and the zero-client guard.

import type { WSBroadcastType } from "@beatsync/shared";
import type { PlayActionType } from "@beatsync/shared/types/WSRequest";
import type { ServerWebSocket } from "bun";
import { afterEach, beforeEach, describe, expect, it, mock, vi } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { RoomManager } from "@/managers/RoomManager";
import type { BunServer, WSData } from "@/utils/websocket";

// Track broadcasts
let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

// Mock responses to capture broadcasts
void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "test-room";
const AUDIO_URL = "https://example.com/song.mp3";

function createPlayAction(opts: { audioSource?: string; trackTimeSeconds?: number } = {}): PlayActionType {
  return {
    type: "PLAY",
    audioSource: opts.audioSource ?? AUDIO_URL,
    trackTimeSeconds: opts.trackTimeSeconds ?? 0,
  };
}

function createMockWs(clientId: string): ServerWebSocket<WSData> {
  return {
    data: { clientId, username: `user-${clientId}`, roomId: ROOM_ID },
    subscribe: mock(() => {
      /* noop */
    }),
    send: mock(() => {
      /* noop */
    }),
    close: mock(() => {
      /* noop */
    }),
  } as unknown as ServerWebSocket<WSData>;
}

function createMockServer(): BunServer {
  return {
    publish: mock(() => {
      /* noop */
    }),
  } as unknown as BunServer;
}

function createRoomWithAudio(): RoomManager {
  const room = new RoomManager(ROOM_ID);
  room.addAudioSource({ url: AUDIO_URL });
  return room;
}

function addClientsToRoom(room: RoomManager, count: number): ServerWebSocket<WSData>[] {
  const sockets: ServerWebSocket<WSData>[] = [];
  for (let i = 1; i <= count; i++) {
    const ws = createMockWs(`client-${i}`);
    room.addClient(ws);
    sockets.push(ws);
  }
  return sockets;
}

function getScheduledActionBroadcasts() {
  return broadcastMessages.filter((msg) => msg.message.type === "SCHEDULED_ACTION");
}

function getLoadAudioBroadcasts() {
  return broadcastMessages.filter(
    (msg) => msg.message.type === "ROOM_EVENT" && msg.message.event.type === "LOAD_AUDIO_SOURCE"
  );
}

describe("Audio Loading Coordination", () => {
  let room: RoomManager;
  let server: BunServer;

  beforeEach(() => {
    broadcastMessages = [];
    room = createRoomWithAudio();
    server = createMockServer();
  });

  afterEach(() => {
    // Clear any pending timeouts from the room
    room.clearAudioLoadingState();
  });

  describe("initiateAudioSourceLoad", () => {
    it("should broadcast LOAD_AUDIO_SOURCE to all clients", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);

      const loadBroadcasts = getLoadAudioBroadcasts();
      expect(loadBroadcasts).toHaveLength(1);

      const msg = loadBroadcasts[0].message;
      if (msg.type !== "ROOM_EVENT" || msg.event.type !== "LOAD_AUDIO_SOURCE") {
        throw new Error("Expected LOAD_AUDIO_SOURCE");
      }
      expect(msg.event.audioSourceToPlay.url).toBe(AUDIO_URL);
    });

    it("should bail when audio source does not exist in room", () => {
      addClientsToRoom(room, 1);

      room.initiateAudioSourceLoad(
        createPlayAction({ audioSource: "https://nonexistent.com/nope.mp3" }),
        "client-1",
        server
      );

      // No broadcasts should be sent
      expect(broadcastMessages).toHaveLength(0);
    });

    it("should mark the initiator client as already loaded", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // Initiator is pre-loaded, so only the other 3 need to report
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      expect(getScheduledActionBroadcasts()).toHaveLength(0);

      room.processClientLoadedAudioSource("client-4", server);

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);
    });

    it("should clear previous pending state when called twice", () => {
      addClientsToRoom(room, 4);

      // First initiation
      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);

      // Second initiation should replace the first
      room.addAudioSource({ url: "https://example.com/song2.mp3" });
      room.initiateAudioSourceLoad(
        createPlayAction({ audioSource: "https://example.com/song2.mp3" }),
        "client-1",
        server
      );

      // Report all clients loaded for the second action
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      room.processClientLoadedAudioSource("client-4", server);

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);

      const msg = scheduled[0].message;
      if (msg.type !== "SCHEDULED_ACTION" || msg.scheduledAction.type !== "PLAY") {
        throw new Error("Expected PLAY scheduled action");
      }
      expect(msg.scheduledAction.audioSource).toBe("https://example.com/song2.mp3");
    });
  });

  describe("processClientLoadedAudioSource", () => {
    it("should trigger play when all clients have loaded", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      expect(getScheduledActionBroadcasts()).toHaveLength(0);

      room.processClientLoadedAudioSource("client-4", server);
      // Now all 4 loaded - should trigger
      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);
    });

    it("should be idempotent for the same client reporting multiple times", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      room.processClientLoadedAudioSource("client-4", server);

      // client-4 reports loaded again multiple times - should not re-trigger
      room.processClientLoadedAudioSource("client-4", server);
      room.processClientLoadedAudioSource("client-4", server);

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);
    });
  });

  describe("executeScheduledPlay (via all clients loaded)", () => {
    it("should broadcast SCHEDULED_ACTION with PLAY and update playback state", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction({ trackTimeSeconds: 42.5 }), "client-1", server);
      broadcastMessages = [];

      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      room.processClientLoadedAudioSource("client-4", server);

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);

      const msg = scheduled[0].message;
      if (msg.type !== "SCHEDULED_ACTION" || msg.scheduledAction.type !== "PLAY") {
        throw new Error("Expected PLAY scheduled action");
      }
      expect(msg.scheduledAction.audioSource).toBe(AUDIO_URL);
      expect(msg.scheduledAction.trackTimeSeconds).toBe(42.5);
      expect(msg.serverTimeToExecute).toBeGreaterThan(0);

      // Playback state should be updated
      const state = room.getPlaybackState();
      expect(state.type).toBe("playing");
      expect(state.audioSource).toBe(AUDIO_URL);
      expect(state.trackPositionSeconds).toBe(42.5);
    });

    it("should not broadcast if the audio source was removed between initiation and execution", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // Remove the audio source mid-load
      room.removeAudioSources([AUDIO_URL]);

      // All remaining clients report loaded - triggers executeScheduledPlay
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      room.processClientLoadedAudioSource("client-4", server);

      // Should not have broadcast a SCHEDULED_ACTION since the track no longer exists
      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(0);

      // Playback state should NOT be updated to playing
      expect(room.getPlaybackState().type).toBe("paused");
    });
  });

  describe("timeout behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should execute play after timeout even if not all clients loaded", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // Only client-2 and client-3 load, client-4 never responds
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      expect(getScheduledActionBroadcasts()).toHaveLength(0);

      // Advance past the 3s timeout
      vi.advanceTimersByTime(3000);

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);
    });

    it("should not double-fire if all clients load before timeout", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // All clients load immediately
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      room.processClientLoadedAudioSource("client-4", server);
      expect(getScheduledActionBroadcasts()).toHaveLength(1);

      // Advance past the timeout window - should not fire again
      vi.advanceTimersByTime(3000);

      // Should still only have 1 scheduled action (timeout was cleared)
      expect(getScheduledActionBroadcasts()).toHaveLength(1);
    });
  });

  describe("client disconnect during loading", () => {
    it("should trigger play when a disconnecting client makes remaining clients all-loaded", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // client-2 and client-3 load
      room.processClientLoadedAudioSource("client-2", server);
      room.processClientLoadedAudioSource("client-3", server);
      expect(getScheduledActionBroadcasts()).toHaveLength(0);

      // client-4 disconnects before loading - remaining 3 are all loaded
      room.removeClient("client-4");

      const scheduled = getScheduledActionBroadcasts();
      expect(scheduled).toHaveLength(1);
    });

    it("should not trigger play if disconnecting client leaves others still unloaded", () => {
      addClientsToRoom(room, 5);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // client-2 loads, client-3/4/5 haven't
      room.processClientLoadedAudioSource("client-2", server);

      // client-3 disconnects - but client-4 and client-5 still haven't loaded
      room.removeClient("client-3");

      expect(getScheduledActionBroadcasts()).toHaveLength(0);
    });

    it("should not trigger play if all clients disconnect during loading", () => {
      addClientsToRoom(room, 4);

      room.initiateAudioSourceLoad(createPlayAction(), "client-1", server);
      broadcastMessages = [];

      // All clients disconnect
      room.removeClient("client-1");
      room.removeClient("client-2");
      room.removeClient("client-3");
      room.removeClient("client-4");

      // Zero clients - should not trigger play
      expect(getScheduledActionBroadcasts()).toHaveLength(0);
    });
  });
});
