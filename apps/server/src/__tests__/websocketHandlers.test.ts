import { describe, expect, it, beforeEach, mock } from "bun:test";
import { handleOpen } from "../routes/websocketHandlers";
import { globalManager } from "../managers/GlobalManager";
import { Server } from "bun";

// Mock the sendBroadcast and sendUnicast functions
mock.module("../utils/responses", () => ({
  sendBroadcast: mock(() => {}),
  sendUnicast: mock(() => {}),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

describe("WebSocket Handlers (Simplified Tests)", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  describe("Audio Source Restoration", () => {
    it("should send existing audio sources to newly joined client", () => {
      // Create a room with audio sources (simulating restored state)
      const roomId = "restored-room";
      const room = globalManager.getOrCreateRoom(roomId);
      room.addAudioSource({ url: "https://example.com/song1.mp3" });
      room.addAudioSource({ url: "https://example.com/song2.mp3" });

      // Track messages sent to the WebSocket
      const sentMessages: string[] = [];
      const mockWs = {
        data: {
          username: "returningUser",
          clientId: "client-123",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock((message: string) => {
          sentMessages.push(message);
        }),
      };

      const mockServer = {
        publish: mock(() => {}),
      } as unknown as Server;

      // Simulate client connection
      handleOpen(mockWs as any, mockServer);

      // Verify SET_AUDIO_SOURCES was sent
      const audioSourcesMessage = sentMessages.find((msg) => {
        try {
          const parsed = JSON.parse(msg);
          return (
            parsed.type === "ROOM_EVENT" &&
            parsed.event?.type === "SET_AUDIO_SOURCES"
          );
        } catch {
          return false;
        }
      });

      expect(audioSourcesMessage).toBeTruthy();

      // Verify the audio sources content
      const parsed = JSON.parse(audioSourcesMessage!);
      expect(parsed.event.sources).toHaveLength(2);
      expect(parsed.event.sources).toEqual([
        { url: "https://example.com/song1.mp3" },
        { url: "https://example.com/song2.mp3" },
      ]);
    });

    it("should not send audio sources for empty rooms", () => {
      // Create an empty room
      const roomId = "new-room";
      globalManager.getOrCreateRoom(roomId);

      // Track messages sent to the WebSocket
      const sentMessages: string[] = [];
      const mockWs = {
        data: {
          username: "newUser",
          clientId: "client-456",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock((message: string) => {
          sentMessages.push(message);
        }),
      };

      const mockServer = {
        publish: mock(() => {}),
      } as unknown as Server;

      // Simulate client connection
      handleOpen(mockWs as any, mockServer);

      // Verify no SET_AUDIO_SOURCES was sent
      const audioSourcesMessage = sentMessages.find((msg) => {
        try {
          const parsed = JSON.parse(msg);
          return (
            parsed.type === "ROOM_EVENT" &&
            parsed.event?.type === "SET_AUDIO_SOURCES"
          );
        } catch {
          return false;
        }
      });

      expect(audioSourcesMessage).toBeUndefined();
    });

    it("should handle multiple clients joining the same room", () => {
      // Create a room with audio sources
      const roomId = "multi-client-room";
      const room = globalManager.getOrCreateRoom(roomId);
      room.addAudioSource({ url: "https://example.com/shared.mp3" });

      // First client joins
      const client1Messages: string[] = [];
      const mockWs1 = {
        data: {
          username: "user1",
          clientId: "client-001",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock((message: string) => {
          client1Messages.push(message);
        }),
      };

      // Second client joins
      const client2Messages: string[] = [];
      const mockWs2 = {
        data: {
          username: "user2",
          clientId: "client-002",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock((message: string) => {
          client2Messages.push(message);
        }),
      };

      const mockServer = {
        publish: mock(() => {}),
      } as unknown as Server;

      // Both clients connect
      handleOpen(mockWs1 as any, mockServer);
      handleOpen(mockWs2 as any, mockServer);

      // Verify both clients received the audio sources
      for (const messages of [client1Messages, client2Messages]) {
        const audioSourcesMessage = messages.find((msg) => {
          try {
            const parsed = JSON.parse(msg);
            return (
              parsed.type === "ROOM_EVENT" &&
              parsed.event?.type === "SET_AUDIO_SOURCES"
            );
          } catch {
            return false;
          }
        });

        expect(audioSourcesMessage).toBeTruthy();
        const parsed = JSON.parse(audioSourcesMessage!);
        expect(parsed.event.sources).toHaveLength(1);
        expect(parsed.event.sources[0].url).toBe(
          "https://example.com/shared.mp3"
        );
      }
    });
  });

  describe("Client State Management", () => {
    it("should add client to room on connection", () => {
      const roomId = "client-test-room";
      const mockWs = {
        data: {
          username: "testUser",
          clientId: "client-789",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock(() => {}),
      };

      const mockServer = {
        publish: mock(() => {}),
      } as unknown as Server;

      // Verify room doesn't exist yet
      expect(globalManager.hasRoom(roomId)).toBe(false);

      // Connect client
      handleOpen(mockWs as any, mockServer);

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
