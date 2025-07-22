import { Server } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { globalManager } from "../managers/GlobalManager";
import { handleOpen } from "../routes/websocketHandlers";

// Create arrays to capture messages
const capturedBroadcasts: any[] = [];
const capturedUnicasts: any[] = [];

// Mock the sendBroadcast and sendUnicast functions
mock.module("../utils/responses", () => ({
  sendBroadcast: mock(({ server, roomId, message }) => {
    capturedBroadcasts.push({ roomId, message });
    // Actually call server.publish so the mock server can capture it
    server.publish(roomId, JSON.stringify(message));
  }),
  sendUnicast: mock(({ ws, message }) => {
    capturedUnicasts.push(message);
    // Actually call ws.send so the mock ws can capture it
    ws.send(JSON.stringify(message));
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

// Mock the R2 operations
mock.module("../lib/r2", () => ({
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  getDefaultAudioSources: mock(async () => []),
}));

describe("WebSocket Handlers (Simplified Tests)", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
    // Clear captured messages
    capturedBroadcasts.length = 0;
    capturedUnicasts.length = 0;
  });

  describe("Audio Source Restoration", () => {
    it("should send existing audio sources to newly joined client", async () => {
      // Create a room with audio sources (simulating restored state)
      const roomId = "restored-room";
      const room = await globalManager.getOrCreateRoom(roomId);
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
        readyState: 1, // WebSocket.OPEN
      };

      // Track messages published to the room
      const publishedMessages: any[] = [];
      const mockServer = {
        publish: mock((roomId: string, message: string) => {
          publishedMessages.push({ roomId, message });
        }),
      } as unknown as Server;

      // Simulate client connection
      await handleOpen(mockWs as any, mockServer);

      // No need to check sent/published messages individually
      // as we're using the captured arrays from the mocked functions

      // Check captured broadcasts for ROOM_STATE_UPDATE
      const stateUpdateBroadcast = capturedBroadcasts.find(
        (b) => b.message.type === "ROOM_STATE_UPDATE"
      );

      expect(stateUpdateBroadcast).toBeTruthy();

      // Verify the audio sources content
      expect(stateUpdateBroadcast.message.state.audioSources).toHaveLength(2);
      expect(stateUpdateBroadcast.message.state.audioSources).toEqual([
        { url: "https://example.com/song1.mp3" },
        { url: "https://example.com/song2.mp3" },
      ]);
    });

    it("should not send audio sources for empty rooms", async () => {
      // Create an empty room
      const roomId = "new-room";
      await globalManager.getOrCreateRoom(roomId);

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
        readyState: 1, // WebSocket.OPEN
      };

      // Track messages published to the room
      const publishedMessages: any[] = [];
      const mockServer = {
        publish: mock((roomId: string, message: string) => {
          publishedMessages.push({ roomId, message });
        }),
      } as unknown as Server;

      // Simulate client connection
      await handleOpen(mockWs as any, mockServer);

      // Check captured broadcasts for ROOM_STATE_UPDATE
      const stateUpdateBroadcast = capturedBroadcasts.find(
        (b) => b.message.type === "ROOM_STATE_UPDATE"
      );

      expect(stateUpdateBroadcast).toBeTruthy();
      expect(stateUpdateBroadcast.message.state.audioSources).toHaveLength(0);
    });

    it("should handle multiple clients joining the same room", async () => {
      // Create a room with audio sources
      const roomId = "multi-client-room";
      const room = await globalManager.getOrCreateRoom(roomId);
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
        readyState: 1, // WebSocket.OPEN
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
        readyState: 1, // WebSocket.OPEN
      };

      // Track messages published to the room
      const publishedMessages: any[] = [];
      const mockServer = {
        publish: mock((roomId: string, message: string) => {
          publishedMessages.push({ roomId, message });
        }),
      } as unknown as Server;

      // Both clients connect
      await handleOpen(mockWs1 as any, mockServer);
      await handleOpen(mockWs2 as any, mockServer);

      // Check captured broadcasts for ROOM_STATE_UPDATE
      // There should be 2 broadcasts (one for each client joining)
      const stateUpdates = capturedBroadcasts.filter(
        (b) => b.message.type === "ROOM_STATE_UPDATE"
      );

      expect(stateUpdates.length).toBeGreaterThanOrEqual(2);
      // Check the last state update has the audio source
      const lastUpdate = stateUpdates[stateUpdates.length - 1];
      expect(lastUpdate.message.state.audioSources).toHaveLength(1);
      expect(lastUpdate.message.state.audioSources[0].url).toBe(
        "https://example.com/shared.mp3"
      );
    });
  });

  describe("Client State Management", () => {
    it("should add client to room on connection", async () => {
      const roomId = "client-test-room";
      const mockWs = {
        data: {
          username: "testUser",
          clientId: "client-789",
          roomId: roomId,
        },
        subscribe: mock(() => {}),
        send: mock(() => {}),
        readyState: 1, // WebSocket.OPEN
      };

      // Track messages published to the room
      const publishedMessages: any[] = [];
      const mockServer = {
        publish: mock((roomId: string, message: string) => {
          publishedMessages.push({ roomId, message });
        }),
      } as unknown as Server;

      // Verify room doesn't exist yet
      expect(globalManager.hasRoom(roomId)).toBe(false);

      // Connect client
      await handleOpen(mockWs as any, mockServer);

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
