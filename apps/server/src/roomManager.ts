import {
  ClientType,
  epochNow,
  MoveClientType,
  WSBroadcastType,
  ClientActionEnum,
} from "@beatsync/shared";
import { GRID, PositionType } from "@beatsync/shared/types/basic";
import { Server, ServerWebSocket } from "bun";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import * as path from "path";
import { AUDIO_DIR, SCHEDULE_TIME_MS } from "./config";
import { calculateGainFromDistanceToSource } from "./spatial";
import { sendBroadcast } from "./utils/responses";
import { debugClientPositions, positionClientsInCircle } from "./utils/spatial";
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
    debugClientPositions(currentRoom.clients);
  }

  removeClient(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(clientId);
    if (room.clients.size === 0) {
      this.stopInterval(roomId);
      this.cleanupRoomFiles(roomId);
      this.rooms.delete(roomId);
    }

    positionClientsInCircle(room.clients);
  }

  // Clean up room files when all clients have left
  async cleanupRoomFiles(roomId: string) {
    try {
      const roomDirPath = path.join(AUDIO_DIR, `room-${roomId}`);

      // Check if the directory exists before attempting to delete files
      // Using Node.js fs.existsSync instead of Bun.file().exists() for directories
      if (existsSync(roomDirPath)) {
        // List all files in the directory
        const files = await readdir(roomDirPath);

        console.log(
          `Found room directory for ${roomId}, cleaning up ${files.length} files...`
        );

        if (files.length > 0) {
          // Delete each file in the directory
          for (const file of files) {
            const filePath = path.join(roomDirPath, file);
            await Bun.file(filePath).delete();
          }

          // Remove the directory using rm -rf
          await Bun.spawn(["rmdir", roomDirPath]).exited;

          console.log(`Cleaned up audio files for room ${roomId}`);
        } else {
          console.log(`No audio files found in room directory ${roomId}`);
        }
      } else {
        console.log(`No audio directory found for room ${roomId}`);
      }
    } catch (error) {
      console.error(`Error cleaning up room files for ${roomId}:`, error);
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

    // Create a closure for the focus index that persists between startInterval calls
    let focusIndex = 0;
    // And one for the number of loops
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

    const roomUpdateMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: ClientActionEnum.Enum.CLIENT_CHANGE,
        clients: this.getClients(roomId),
      },
    };
    sendBroadcast({ server, roomId, message: roomUpdateMessage });

    // Update spatial audio config
    this._calculateGainsAndBroadcast({ room, server });
  }
}
export const roomManager = new RoomManager();
