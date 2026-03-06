import type { WSBroadcastType } from "@beatsync/shared";
import { describe, expect, it, beforeEach, mock } from "bun:test";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { handleOpen } from "@/routes/websocketHandlers";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

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

describe("WebSocket Handlers (Simplified Tests)", () => {
  beforeEach(() => {
    // Clear broadcast messages
    broadcastMessages = [];

    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      globalManager.deleteRoom(roomId);
    }
  });

  describe("Audio Source Restoration", () => {
    it("should send existing audio sources to newly joined client", () => {
      // Create a room with audio sources (simulating restored state)
      const roomId = "restored-room";
      const room = globalManager.getOrCreateRoom(roomId);
      room.addAudioSource({ url: "https://example.com/song1.mp3" });
      room.addAudioSource({ url: "https://example.com/song2.mp3" });

      const mockServer = createMockServer();

      handleOpen(createMockWs({ clientId: "client-123", username: "returningUser", roomId }), mockServer);

      // Verify SET_AUDIO_SOURCES was broadcast
      const audioSourcesMessage = broadcastMessages.find((msg) => {
        return msg.message.type === "ROOM_EVENT" && msg.message.event?.type === "SET_AUDIO_SOURCES";
      });

      expect(audioSourcesMessage).toBeTruthy();

      // Verify the audio sources content
      const msg = audioSourcesMessage!.message;
      if (msg.type !== "ROOM_EVENT" || msg.event.type !== "SET_AUDIO_SOURCES")
        throw new Error("Expected SET_AUDIO_SOURCES");
      expect(msg.event.sources).toHaveLength(2);
      expect(msg.event.sources).toEqual([
        { url: "https://example.com/song1.mp3" },
        { url: "https://example.com/song2.mp3" },
      ]);
    });

    it("should not send audio sources for empty rooms", () => {
      // Create an empty room
      const roomId = "new-room";
      globalManager.getOrCreateRoom(roomId);

      const mockServer = createMockServer();
      broadcastMessages = [];

      handleOpen(createMockWs({ clientId: "client-456", username: "newUser", roomId }), mockServer);

      // Verify no SET_AUDIO_SOURCES was broadcast
      const audioSourcesMessage = broadcastMessages.find((msg) => {
        return msg.message.type === "ROOM_EVENT" && msg.message.event?.type === "SET_AUDIO_SOURCES";
      });

      expect(audioSourcesMessage).toBeUndefined();
    });

    it("should handle multiple clients joining the same room", () => {
      // Create a room with audio sources
      const roomId = "multi-client-room";
      const room = globalManager.getOrCreateRoom(roomId);
      room.addAudioSource({ url: "https://example.com/shared.mp3" });

      const mockServer = createMockServer();
      broadcastMessages = [];

      handleOpen(createMockWs({ clientId: "client-001", username: "user1", roomId }), mockServer);
      handleOpen(createMockWs({ clientId: "client-002", username: "user2", roomId }), mockServer);

      // Count how many SET_AUDIO_SOURCES broadcasts were sent
      const audioSourcesMessages = broadcastMessages.filter((msg) => {
        return msg.message.type === "ROOM_EVENT" && msg.message.event?.type === "SET_AUDIO_SOURCES";
      });

      // Should have broadcast audio sources twice (once for each client joining)
      expect(audioSourcesMessages).toHaveLength(2);

      // Verify the content of audio sources
      for (const entry of audioSourcesMessages) {
        const m = entry.message;
        if (m.type !== "ROOM_EVENT" || m.event.type !== "SET_AUDIO_SOURCES")
          throw new Error("Expected SET_AUDIO_SOURCES");
        expect(m.event.sources).toHaveLength(1);
        expect(m.event.sources[0].url).toBe("https://example.com/shared.mp3");
      }
    });
  });

  describe("Client State Management", () => {
    it("should add client to room on connection", () => {
      const roomId = "client-test-room";
      const mockServer = createMockServer();

      expect(globalManager.hasRoom(roomId)).toBe(false);

      handleOpen(createMockWs({ clientId: "client-789", username: "testUser", roomId }), mockServer);

      // Verify room was created and client was added
      expect(globalManager.hasRoom(roomId)).toBe(true);
      const room = globalManager.getRoom(roomId);
      expect(room).toBeTruthy();

      const clients = room!.getClients();
      expect(clients).toHaveLength(1);
      expect(clients[0].username).toBe("testUser");
      expect(clients[0].clientId).toBe("client-789");
    });
  });
});
