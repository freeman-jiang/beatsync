import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Server } from "bun";
import { ClientActionEnum, ClientType } from "@beatsync/shared";
import { createTestWSServer, createTestWSClient, TestWebSocketClient, TestWSMessage } from "../utils/wsTestHelpers";
import { roomManager } from "../../roomManager";

describe("WebSocket Handlers", () => {
  let server: Server;

  beforeAll(() => {
    server = createTestWSServer();
  });

  afterAll(() => {
    server.stop();
  });

  test("should handle play/pause messages", async () => {
    const client1 = await createTestWSClient(server, {
      roomId: "playback-room",
      username: "user1",
      clientId: "client1",
    });

    const client2 = await createTestWSClient(server, {
      roomId: "playback-room",
      username: "user2",
      clientId: "client2",
    });

    try {
      // Send play command
      client1.send({
        type: ClientActionEnum.enum.PLAY,
        timestamp: 0,
        trackTimeSeconds: 0,
        audioId: "test-audio",
      });

      // Both clients should receive scheduled action
      const playAction1 = await client1.waitForMessage(msg => 
        msg.type === "SCHEDULED_ACTION" && 
        msg.scheduledAction?.type === ClientActionEnum.enum.PLAY
      );
      const playAction2 = await client2.waitForMessage(msg => 
        msg.type === "SCHEDULED_ACTION" && 
        msg.scheduledAction?.type === ClientActionEnum.enum.PLAY
      );

      expect(playAction1.type).toBe("SCHEDULED_ACTION");
      expect(playAction1.scheduledAction.type).toBe(ClientActionEnum.enum.PLAY);
      expect(playAction1.serverTimeToExecute).toBeNumber();

      expect(playAction2).toEqual(playAction1);
    } finally {
      client1.close();
      client2.close();
    }
  });

  test("should handle spatial audio control", async () => {
    const client = await createTestWSClient(server, {
      roomId: "spatial-room",
      username: "spatial-user",
      clientId: "spatial-client",
    });

    try {
      // Start spatial audio
      client.send({
        type: ClientActionEnum.enum.START_SPATIAL_AUDIO,
      });

      // Should receive gain updates with a 3 second timeout
      const gainUpdate = await client.waitForMessage(
        msg => 
          msg.type === "SCHEDULED_ACTION" && 
          msg.scheduledAction?.type === "SPATIAL_CONFIG" &&
          msg.scheduledAction?.gains &&
          typeof msg.scheduledAction.gains === "object",
        3000
      ).catch(error => {
        throw new Error(`Timeout waiting for gain update: ${error.message}`);
      });

      expect(gainUpdate.scheduledAction.gains).toBeDefined();
      expect(typeof gainUpdate.scheduledAction.gains).toBe("object");

      // Stop spatial audio
      client.send({
        type: ClientActionEnum.enum.STOP_SPATIAL_AUDIO,
      });

      // Should receive stop action with a 3 second timeout
      const stopAction = await client.waitForMessage(
        msg =>
          msg.type === "SCHEDULED_ACTION" && 
          msg.scheduledAction?.type === "STOP_SPATIAL_AUDIO",
        3000
      ).catch(error => {
        throw new Error(`Timeout waiting for stop action: ${error.message}`);
      });
      
      expect(stopAction.type).toBe("SCHEDULED_ACTION");
      expect(stopAction.scheduledAction.type).toBe("STOP_SPATIAL_AUDIO");
    } finally {
      client.send({
        type: ClientActionEnum.enum.STOP_SPATIAL_AUDIO,
      });
      client.close();
    }
  });

  test("should handle client movement", async () => {
    const client1 = await createTestWSClient(server, {
      roomId: "movement-room",
      username: "user1",
      clientId: "client1",
    });

    const client2 = await createTestWSClient(server, {
      roomId: "movement-room",
      username: "user2",
      clientId: "client2",
    });

    try {
      // First verify both clients are in the room
      const initialRoomEvent = await client1.waitForMessage(
        msg =>
          msg.type === "ROOM_EVENT" &&
          msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
          msg.event?.clients?.length === 2,
        3000
      );
      expect(initialRoomEvent.event.clients.length).toBe(2);

      // Store client1's ID for later comparison
      const client1Id = client1.getClientId();
      expect(client1Id).toBeDefined();

      // Move client1
      const moveMessage = {
        type: ClientActionEnum.enum.MOVE_CLIENT,
        clientId: client1Id,
        position: {
          x: 100,
          y: 100,
        },
      };

      // Send the move command
      client1.send(moveMessage);

      // First wait for the room update on client1
      const moveUpdate1 = await client1.waitForMessage(
        msg =>
          msg.type === "ROOM_EVENT" &&
          msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
          msg.event?.clients?.some((c: ClientType) => 
            c.clientId === client1Id &&
            c.position?.x === 100 &&
            c.position?.y === 100
          ),
        3000
      );

      // Verify the room update structure
      expect(moveUpdate1.type).toBe("ROOM_EVENT");
      expect(moveUpdate1.event.type).toBe(ClientActionEnum.Enum.CLIENT_CHANGE);
      const movedClient = moveUpdate1.event.clients.find((c: ClientType) => c.clientId === client1Id);
      expect(movedClient).toBeDefined();
      expect(movedClient!.position).toEqual({ x: 100, y: 100 });

      // Then verify client2 received the same room update
      const moveUpdate2 = await client2.waitForMessage(
        msg =>
          msg.type === "ROOM_EVENT" &&
          msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
          msg.event?.clients?.some((c: ClientType) => 
            c.clientId === client1Id &&
            c.position?.x === 100 &&
            c.position?.y === 100
          ),
        3000
      );
      expect(moveUpdate2).toEqual(moveUpdate1);

      // Now wait for spatial config updates
      const spatialConfig1 = await client1.waitForMessage(
        msg =>
          msg.type === "SCHEDULED_ACTION" &&
          msg.scheduledAction?.type === "SPATIAL_CONFIG" &&
          msg.scheduledAction?.gains !== undefined,
        3000
      );

      // Verify spatial config structure
      expect(spatialConfig1.type).toBe("SCHEDULED_ACTION");
      expect(spatialConfig1.scheduledAction.type).toBe("SPATIAL_CONFIG");
      expect(spatialConfig1.scheduledAction.gains).toBeDefined();

      // Verify client2 gets the same spatial config
      const spatialConfig2 = await client2.waitForMessage(
        msg =>
          msg.type === "SCHEDULED_ACTION" &&
          msg.scheduledAction?.type === "SPATIAL_CONFIG" &&
          msg.scheduledAction?.gains !== undefined,
        3000
      );
      expect(spatialConfig2).toEqual(spatialConfig1);

    } catch (error) {
      console.error('Test failed:', error);
      throw error;
    } finally {
      client1.close();
      client2.close();
    }
  });

  test("should handle client reordering", async () => {
    const client1 = await createTestWSClient(server, {
      roomId: "reorder-room",
      username: "user1",
      clientId: "client1",
    });

    const client2 = await createTestWSClient(server, {
      roomId: "reorder-room",
      username: "user2",
      clientId: "client2",
    });

    try {
      // Get client IDs
      const client2Id = client2.getClientId();
      expect(client2Id).toBeDefined();

      // Reorder clients
      client1.send({
        type: ClientActionEnum.enum.REORDER_CLIENT,
        clientId: client2Id,
      });

      // Both clients should receive updated order
      const reorderUpdate1 = await client1.waitForMessage(msg =>
        msg.type === "ROOM_EVENT" && 
        msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
        msg.event?.clients?.[0]?.clientId === client2Id
      );
      const reorderUpdate2 = await client2.waitForMessage(msg =>
        msg.type === "ROOM_EVENT" && 
        msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
        msg.event?.clients?.[0]?.clientId === client2Id
      );

      expect(reorderUpdate1.type).toBe("ROOM_EVENT");
      expect(reorderUpdate1.event.type).toBe(ClientActionEnum.Enum.CLIENT_CHANGE);
      expect(reorderUpdate1.event.clients[0].clientId).toBe(client2Id);

      expect(reorderUpdate2).toEqual(reorderUpdate1);
    } finally {
      client1.close();
      client2.close();
    }
  });

  test("should handle invalid messages", async () => {
    const client = await createTestWSClient(server, {
      roomId: "error-room",
      username: "error-user",
      clientId: "error-client",
    });

    try {
      // Send invalid message
      client.send({
        type: "INVALID_TYPE",
        data: "invalid",
      });

      // Should receive error response
      const errorResponse = await client.waitForMessage(msg =>
        msg.type === "ERROR" && msg.message === "Invalid message format"
      );
      expect(errorResponse.type).toBe("ERROR");
      expect(errorResponse.message).toBe("Invalid message format");
    } finally {
      client.close();
    }
  });
}); 