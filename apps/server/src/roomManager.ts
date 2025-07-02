import {
  ClientType,
  epochNow,
  MoveClientType,
  WSBroadcastType,
} from "@beatsync/shared";
import { GRID, PositionType } from "@beatsync/shared/types/basic";
import { Server, ServerWebSocket } from "bun";
import { SCHEDULE_TIME_MS } from "./config";
import { deleteObjectsWithPrefix } from "./lib/r2";
import { calculateGainFromDistanceToSource } from "./spatial";
import { sendBroadcast } from "./utils/responses";
import { positionClientsInCircle } from "./utils/spatial";
import { WSData } from "./utils/websocket";

interface RoomData {
  clients: Map<string, ClientType>;
  roomId: string;
  intervalId?: NodeJS.Timeout; // https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval
  listeningSource: PositionType;
}

class RoomManager {
  rooms = new Map<string, RoomData>();

  addClient(ws: ServerWebSocket<WSData>) {
    const { roomId, username, clientId } = ws.data;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.rooms.set(roomId, {
        clients: new Map(),
        roomId,
        listeningSource: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y }, // Center of the grid
      });
    }

    const currentRoom = this.rooms.get(roomId)!;

    // Add the new client
    currentRoom.clients.set(clientId, {
      username,
      clientId,
      ws,
      rtt: 0,
      position: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y - 25 }, // Initial position at center
    });

    positionClientsInCircle(currentRoom.clients);
    // debugClientPositions(currentRoom.clients);
  }

  async removeClient(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(
        `RACE CONDITION: Room ${roomId} not found even though client is leaving`
      );
      return;
    }

    room.clients.delete(clientId);

    // Check if this was the last client in the room
    if (room.clients.size === 0) {
      this.stopInterval(roomId);

      // CRITICAL: Async operation that can take significant time
      // During this await, new clients can join the room!
      // This is especially common during development with hot reloading
      // or when users quickly refresh their browser
      await this.cleanupRoom(roomId);

      // IMPORTANT: We must re-check the room state after the async operation
      // The room could have been:
      // 1. Deleted and recreated with new clients (common in dev)
      // 2. Had new clients added to the existing room
      // 3. Still be empty and safe to delete
      const currentRoom = this.rooms.get(roomId);

      if (currentRoom && currentRoom.clients.size === 0) {
        // Safe to delete - room still exists and is still empty
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted from memory`);
      } else if (currentRoom && currentRoom.clients.size > 0) {
        // Race condition avoided! New clients joined during cleanup
        console.log(`Room ${roomId} has new clients - skipping deletion`);
        // Need to reposition the new clients that joined during cleanup
        positionClientsInCircle(currentRoom.clients);
      }
      // If currentRoom is undefined, another cleanup already deleted it
      return; // No need to reposition when room is empty or deleted
    }

    // Otherwise, other clients remain, reposition remaining clients in the room
    positionClientsInCircle(room.clients);
  }

  // Clean up room files when all clients have left
  async cleanupRoom(roomId: string) {
    console.log(`🧹 Starting room cleanup for room ${roomId}...`);

    try {
      const result = await deleteObjectsWithPrefix(`room-${roomId}`);
      console.log(`✅ Room ${roomId} objects deleted: ${result.deletedCount}`);
    } catch (error) {
      console.error(`❌ Room ${roomId} cleanup failed:`, error);
    }
  }

  getRoomState(roomId: string): RoomData | undefined {
    return this.rooms.get(roomId);
  }

  getClients(roomId: string): ClientType[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.clients.values());
  }

  // Reorder clientId so that the client is at the end of the array
  reorderClients({
    roomId,
    clientId,
    server,
  }: {
    roomId: string;
    clientId: string;
    server: Server;
  }): ClientType[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const clients = Array.from(room.clients.values());
    const clientIndex = clients.findIndex(
      (client) => client.clientId === clientId
    );

    if (clientIndex === -1) return clients; // Client not found

    // Move the client to the front
    const [client] = clients.splice(clientIndex, 1);
    clients.unshift(client);

    // Update the clients map to maintain the new order
    room.clients.clear();
    clients.forEach((client) => {
      room.clients.set(client.clientId, client);
    });

    // Update client positions based on new order
    positionClientsInCircle(room.clients);

    // Update gains
    this._calculateGainsAndBroadcast({ room, server });

    return clients;
  }

  // Method to update the RTT for a specific client
  updateClientRTT(roomId: string, clientId: string, rtt: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const client = room.clients.get(clientId);
    if (client) {
      client.rtt = rtt;
      room.clients.set(clientId, client);
    }
  }

  startInterval({ server, roomId }: { server: Server; roomId: string }) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Create a closure for the number of loops
    let loopCount = 0;

    const updateSpatialAudio = () => {
      const clients = Array.from(room.clients.values()); // get most recent
      console.log(
        `ROOM ${roomId} LOOP ${loopCount}: Connected clients: ${clients.length}`
      );
      if (clients.length === 0) return;

      // Calculate new position for listening source in a circle
      // Use loopCount to determine the angle
      const radius = 25; // Radius of the circle
      const centerX = GRID.ORIGIN_X;
      const centerY = GRID.ORIGIN_Y;
      const angle = (loopCount * Math.PI) / 30; // Slow rotation, completes a circle every 60 iterations

      const newX = centerX + radius * Math.cos(angle);
      const newY = centerY + radius * Math.sin(angle);

      // Update the listening source position
      room.listeningSource = { x: newX, y: newY };

      // Calculate gains for each client based on distance from listening source
      const gains = Object.fromEntries(
        clients.map((client) => {
          const gain = calculateGainFromDistanceToSource({
            client: client.position,
            source: room.listeningSource,
          });

          return [
            client.clientId,
            {
              gain,
              rampTime: 0.25, // Use a moderate ramp time for smooth transitions
            },
          ];
        })
      );

      // Send the updated configuration to all clients
      const message: WSBroadcastType = {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
        scheduledAction: {
          type: "SPATIAL_CONFIG",
          listeningSource: room.listeningSource,
          gains,
        },
      };

      sendBroadcast({ server, roomId, message });
      loopCount++;
    };

    room.intervalId = setInterval(updateSpatialAudio, 100);
  }

  stopInterval(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    clearInterval(room.intervalId);
    room.intervalId = undefined;
  }

  _calculateGainsAndBroadcast({
    room,
    server,
  }: {
    room: RoomData;
    server: Server;
  }) {
    // Calculate gains for each client based on distance from listening source
    const clients = Array.from(room.clients.values());

    const gains = Object.fromEntries(
      clients.map((client) => {
        const gain = calculateGainFromDistanceToSource({
          client: client.position,
          source: room.listeningSource,
        });

        console.log(
          `Client ${client.username} at (${client.position.x}, ${
            client.position.y
          }) - gain: ${gain.toFixed(2)}`
        );
        return [
          client.clientId,
          {
            gain,
            rampTime: 0.25, // Use a moderate ramp time for smooth transitions
          },
        ];
      })
    );

    // Send the updated gains to all clients
    sendBroadcast({
      server,
      roomId: room.roomId,
      message: {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: epochNow() + 0,
        scheduledAction: {
          type: "SPATIAL_CONFIG",
          listeningSource: room.listeningSource,
          gains,
        },
      },
    });
  }

  updateListeningSource({
    roomId,
    position,
    server,
  }: {
    roomId: string;
    position: PositionType;
    server: Server;
  }) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.listeningSource = position;

    this._calculateGainsAndBroadcast({ room, server });
  }

  // TODO: Refactor: Make another interface that wraps all of this | so roomId, server, etc. are not passed in every time
  moveClient({
    parsedMessage,
    roomId,
    server,
  }: {
    parsedMessage: MoveClientType;
    roomId: string;
    server: Server;
  }) {
    const { clientId, position } = parsedMessage;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const client = room.clients.get(clientId);
    if (!client) return;

    client.position = position;
    room.clients.set(clientId, client);

    // Update spatial audio config
    this._calculateGainsAndBroadcast({ room, server });
  }
}
export const roomManager = new RoomManager();
