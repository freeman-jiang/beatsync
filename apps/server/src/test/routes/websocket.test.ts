import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Server } from "bun";
import { ClientActionEnum } from "@beatsync/shared";
import { createTestWSServer, createTestWSClient, TestWebSocketClient } from "../utils/wsTestHelpers";
import { roomManager } from "../../roomManager";

describe("WebSocket Routes", () => {
  let server: Server;

  beforeAll(() => {
    server = createTestWSServer();
  });

  afterAll(() => {
    server.stop();
  });

  test("should reject connection without required parameters", async () => {
    // Try to connect without parameters
    const response = await fetch(`http://localhost:${server.port}`);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe("roomId and userId are required");

    // Try to connect with only roomId
    const response2 = await fetch(`http://localhost:${server.port}?roomId=test`);
    expect(response2.status).toBe(400);
    const text2 = await response2.text();
    expect(text2).toBe("roomId and userId are required");

    // Try to connect with only username
    const response3 = await fetch(`http://localhost:${server.port}?username=test`);
    expect(response3.status).toBe(400);
    const text3 = await response3.text();
    expect(text3).toBe("roomId and userId are required");
  });

  test("should establish connection with valid parameters", async () => {
    const client = await createTestWSClient(server, {
      roomId: "test-room",
      username: "test-user",
      clientId: "test-client",
    });

    try {
      const clientId = client.getClientId();
      expect(clientId).toBeDefined();
    } finally {
      client.close();
    }
  });

  test("should handle multiple clients in a room", async () => {
    const client1 = await createTestWSClient(server, {
      roomId: "multi-room",
      username: "user1",
      clientId: "client1",
    });

    const client2 = await createTestWSClient(server, {
      roomId: "multi-room",
      username: "user2",
      clientId: "client2",
    });

    try {
      // Both clients should have valid client IDs
      const client1Id = client1.getClientId();
      const client2Id = client2.getClientId();
      expect(client1Id).toBeDefined();
      expect(client2Id).toBeDefined();

      // Both clients should receive room update with 2 clients
      const roomEvent = await client1.waitForRoomEvent();
      expect(roomEvent.event.clients.length).toBe(2);
      expect(roomEvent.event.clients.map((c: any) => c.username).sort()).toEqual(["user1", "user2"]);
    } finally {
      client1.close();
      client2.close();
    }
  });

  test("should handle client disconnection", async () => {
    const client1 = await createTestWSClient(server, {
      roomId: "disconnect-room",
      username: "user1",
      clientId: "client1",
    });

    const client2 = await createTestWSClient(server, {
      roomId: "disconnect-room",
      username: "user2",
      clientId: "client2",
    });

    try {
      // Close client1
      client1.close();

      // Client2 should receive update about client1's disconnection
      const disconnectUpdate = await client2.waitForMessage(msg =>
        msg.type === "ROOM_EVENT" && 
        msg.event?.type === ClientActionEnum.Enum.CLIENT_CHANGE &&
        msg.event?.clients?.length === 1 &&
        msg.event?.clients[0].username === "user2"
      );

      expect(disconnectUpdate.type).toBe("ROOM_EVENT");
      expect(disconnectUpdate.event.type).toBe(ClientActionEnum.Enum.CLIENT_CHANGE);
      expect(disconnectUpdate.event.clients.length).toBe(1);
      expect(disconnectUpdate.event.clients[0].username).toBe("user2");
    } finally {
      client2.close();
    }
  });

  test("should handle NTP request/response", async () => {
    const client = await createTestWSClient(server, {
      roomId: "ntp-room",
      username: "ntp-user",
      clientId: "ntp-client",
    });

    try {
      // Send NTP request
      const t0 = Date.now();
      client.send({
        type: ClientActionEnum.enum.NTP_REQUEST,
        t0,
      });

      // Wait for NTP response
      const ntpResponse = await client.waitForMessage(msg =>
        msg.type === "NTP_RESPONSE" && msg.t0 === t0
      );

      expect(ntpResponse.type).toBe("NTP_RESPONSE");
      expect(ntpResponse.t0).toBe(t0);
      expect(ntpResponse.t1).toBeNumber();
      expect(ntpResponse.t2).toBeNumber();
      expect(ntpResponse.t1).toBeLessThanOrEqual(ntpResponse.t2);
    } finally {
      client.close();
    }
  });
}); 