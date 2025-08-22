import { ServerWebSocket } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { globalManager } from "../managers/GlobalManager";
import { RoomManager } from "../managers/RoomManager";
import { WSData } from "../utils/websocket";

// Mock the R2 module to avoid external calls
mock.module("../lib/r2", () => ({
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  uploadJSON: mock(async () => {}),
  downloadJSON: mock(async () => null),
  getLatestFileWithPrefix: mock(async () => null),
  getSortedFilesWithPrefix: mock(async () => []),
  deleteObject: mock(async () => {}),
  validateAudioFileExists: mock(async () => true),
  cleanupOrphanedRooms: mock(async () => ({
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
  })),
}));

// Helper function to create a mock WebSocket
function createMockWs(
  clientId: string,
  username: string,
  roomId: string
): ServerWebSocket<WSData> {
  return {
    data: {
      clientId,
      username,
      roomId,
    },
    subscribe: mock(() => {}),
    send: mock(() => {}),
    close: mock(() => {}),
  } as any;
}

describe("Admin Persistence", () => {
  let room: RoomManager;
  const roomId = "test-room";

  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const id of roomIds) {
      await globalManager.deleteRoom(id);
    }
    // Create a fresh room for each test
    room = globalManager.getOrCreateRoom(roomId);
  });

  it("should make the first person who joins an admin", () => {
    const ws1 = createMockWs("client-1", "user1", roomId);

    room.addClient(ws1);

    const clients = room.getClients();
    expect(clients.length).toBe(1);
    expect(clients[0].isAdmin).toBe(true);
    expect(clients[0].clientId).toBe("client-1");
  });

  it("should promote the oldest person when the only admin leaves", () => {
    const ws1 = createMockWs("client-1", "admin-user", roomId);
    const ws2 = createMockWs("client-2", "user2", roomId);
    const ws3 = createMockWs("client-3", "user3", roomId);

    // Add clients in order
    room.addClient(ws1); // Admin
    room.addClient(ws2); // Will be oldest when admin leaves
    room.addClient(ws3);

    // Verify initial state
    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(false);
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(false);

    // Admin leaves
    room.removeClient("client-1");

    // Check that client-2 (oldest remaining) becomes admin
    clients = room.getClients();
    expect(clients.length).toBe(2);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(false);
  });

  it("should preserve admin status and username when client rejoins with same ID", () => {
    const ws1 = createMockWs("client-1", "admin-user", roomId);
    const ws2 = createMockWs("client-2", "user2", roomId);

    // Setup: admin and another user
    room.addClient(ws1);
    room.addClient(ws2);

    // Verify initial state
    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-1")?.username).toBe(
      "admin-user"
    );

    // Admin disconnects
    room.removeClient("client-1");

    // Verify admin is gone but client-2 becomes admin
    clients = room.getClients();
    expect(clients.length).toBe(1);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);

    // Original admin rejoins with same clientId
    const ws1Reconnect = createMockWs("client-1", "admin-user", roomId);
    room.addClient(ws1Reconnect);

    // Verify admin status is restored
    clients = room.getClients();
    expect(clients.length).toBe(2);
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-1")?.username).toBe(
      "admin-user"
    );
    // Client-2 should still be admin too (both can be admin)
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
  });

  it("should keep non-admin as non-admin when rejoining", () => {
    const ws1 = createMockWs("client-1", "admin", roomId);
    const ws2 = createMockWs("client-2", "regular-user", roomId);

    // Setup: admin and regular user
    room.addClient(ws1);
    room.addClient(ws2);

    // Verify initial state
    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(false);

    // Non-admin disconnects and reconnects
    room.removeClient("client-2");

    const ws2Reconnect = createMockWs("client-2", "regular-user", roomId);
    room.addClient(ws2Reconnect);

    // Verify they're still not admin
    clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(false);
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
  });

  it("should handle multiple admins correctly", () => {
    const ws1 = createMockWs("client-1", "admin1", roomId);
    const ws2 = createMockWs("client-2", "user2", roomId);
    const ws3 = createMockWs("client-3", "user3", roomId);

    // Setup: one admin, two regular users
    room.addClient(ws1);
    room.addClient(ws2);
    room.addClient(ws3);

    // Manually promote client-2 to admin (simulating SET_ADMIN command)
    room.setAdmin({ targetClientId: "client-2", isAdmin: true });

    // Verify we have two admins
    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(false);

    // One admin leaves
    room.removeClient("client-1");

    // Verify the other admin remains admin, no promotion needed
    clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(false);

    // Original admin rejoins
    const ws1Reconnect = createMockWs("client-1", "admin1", roomId);
    room.addClient(ws1Reconnect);

    // Both should be admins again
    clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
  });

  it("should allow original admin to reclaim status after another was promoted", () => {
    const ws1 = createMockWs("client-1", "original-admin", roomId);
    const ws2 = createMockWs("client-2", "user2", roomId);

    // Setup: admin and regular user
    room.addClient(ws1);
    room.addClient(ws2);

    // Admin leaves, user2 gets promoted
    room.removeClient("client-1");

    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);

    // Original admin returns
    const ws1Reconnect = createMockWs("client-1", "original-admin", roomId);
    room.addClient(ws1Reconnect);

    // Both should be admins now
    clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-2")?.isAdmin).toBe(true);
  });

  it("should preserve client data even without active connection", () => {
    const ws1 = createMockWs("client-1", "user1", roomId);

    room.addClient(ws1);

    // Get the client data directly (bypassing getClients which filters by connection)
    const client = room.getClient("client-1");
    expect(client).toBeDefined();
    expect(client?.isAdmin).toBe(true);

    // Remove client (only removes from wsConnections now)
    room.removeClient("client-1");

    // Client data should still exist
    const clientAfterRemoval = room.getClient("client-1");
    expect(clientAfterRemoval).toBeDefined();
    expect(clientAfterRemoval?.isAdmin).toBe(true);

    // But getClients should return empty (no active connections)
    const activeClients = room.getClients();
    expect(activeClients.length).toBe(0);
  });

  it("should handle empty room becoming populated again", () => {
    const ws1 = createMockWs("client-1", "user1", roomId);
    const ws2 = createMockWs("client-2", "user2", roomId);

    // Add and remove all clients
    room.addClient(ws1);
    room.addClient(ws2);
    room.removeClient("client-1");
    room.removeClient("client-2");

    // Room is empty
    expect(room.getClients().length).toBe(0);

    // New client joins empty room (but with cached data)
    const ws3 = createMockWs("client-3", "user3", roomId);
    room.addClient(ws3);

    // Should become admin as first active connection
    let clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(true);

    // Old admin rejoins
    const ws1Reconnect = createMockWs("client-1", "user1", roomId);
    room.addClient(ws1Reconnect);

    // Old admin should reclaim admin status
    clients = room.getClients();
    expect(clients.find((c) => c.clientId === "client-1")?.isAdmin).toBe(true);
    expect(clients.find((c) => c.clientId === "client-3")?.isAdmin).toBe(true);
  });

  it("should preserve old username if it changes on rejoin", () => {
    const ws1 = createMockWs("client-1", "original-name", roomId);

    room.addClient(ws1);

    let clients = room.getClients();
    expect(clients[0].username).toBe("original-name");

    // Disconnect and rejoin with different username
    room.removeClient("client-1");

    const ws1NewName = createMockWs("client-1", "new-name", roomId);
    room.addClient(ws1NewName);

    clients = room.getClients();
    expect(clients[0].username).toBe("original-name"); // Should still be the old name
    expect(clients[0].clientId).toBe("client-1");
    expect(clients[0].isAdmin).toBe(true); // Admin status preserved
  });
});
