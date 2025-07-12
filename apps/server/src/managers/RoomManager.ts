import {
  ClientType,
  epochNow,
  AudioSourceType,
  PositionType,
  WSBroadcastType,
} from "@beatsync/shared";
import { GRID } from "@beatsync/shared/types/basic";
import { Server, ServerWebSocket } from "bun";
import { SCHEDULE_TIME_MS } from "../config";
import { deleteObjectsWithPrefix } from "../lib/r2";
import { calculateGainFromDistanceToSource } from "../spatial";
import { sendBroadcast } from "../utils/responses";
import { positionClientsInCircle } from "../utils/spatial";
import { WSData } from "../utils/websocket";

interface RoomData {
  audioSources: AudioSourceType[];
  clients: Map<string, ClientType>;
  roomId: string;
  intervalId?: NodeJS.Timeout;
  listeningSource: PositionType;
}

/**
 * RoomManager handles all operations for a single room.
 * Each room has its own instance of RoomManager.
 */
export class RoomManager {
  private clients = new Map<string, ClientType>();
  private audioSources: AudioSourceType[] = [];
  private listeningSource: PositionType;
  private intervalId?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly roomId: string) {
    this.listeningSource = { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y };
  }

  /**
   * Get the room ID
   */
  getRoomId(): string {
    return this.roomId;
  }

  /**
   * Add a client to the room
   */
  addClient(ws: ServerWebSocket<WSData>): void {
    // Cancel any pending cleanup since room is active again
    this.cancelCleanup();

    const { username, clientId } = ws.data;

    // Add the new client
    this.clients.set(clientId, {
      username,
      clientId,
      ws,
      rtt: 0,
      position: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y - 25 }, // Initial position at center
    });

    positionClientsInCircle(this.clients);
  }

  /**
   * Remove a client from the room
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);

    // Reposition remaining clients if any
    if (this.clients.size > 0) {
      positionClientsInCircle(this.clients);
    }
  }

  /**
   * Add an audio source to the room
   */
  addAudioSource(source: AudioSourceType): AudioSourceType[] {
    this.audioSources.push(source);
    return this.audioSources;
  }

  // Set all audio sources (used in backup restoration)
  setAudioSources(sources: AudioSourceType[]): AudioSourceType[] {
    this.audioSources = sources;
    return this.audioSources;
  }

  /**
   * Get all clients in the room
   */
  getClients(): ClientType[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if the room is empty
   */
  isEmpty(): boolean {
    return this.clients.size === 0;
  }

  /**
   * Check if the room has any active WebSocket connections
   * (as opposed to ghost clients from restored state)
   */
  hasActiveConnections(): boolean {
    const clients = Array.from(this.clients.values());
    for (const client of clients) {
      const ws: ServerWebSocket<WSData> = client.ws;
      // Check if the WebSocket is still active
      // 1 = OPEN
      if (ws && ws.readyState === 1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the room state
   */
  getState(): RoomData {
    return {
      audioSources: this.audioSources,
      clients: this.clients,
      roomId: this.roomId,
      intervalId: this.intervalId,
      listeningSource: this.listeningSource,
    };
  }

  /**
   * Get room statistics
   */
  getStats() {
    return {
      roomId: this.roomId,
      clientCount: this.clients.size,
      audioSourceCount: this.audioSources.length,
      hasSpatialAudio: !!this.intervalId,
    };
  }

  /**
   * Update client RTT (Round Trip Time)
   */
  updateClientRTT(clientId: string, rtt: number): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.rtt = rtt;
      this.clients.set(clientId, client);
    }
  }

  /**
   * Reorder clients, moving the specified client to the front
   */
  reorderClients(clientId: string, server: Server): ClientType[] {
    const clients = Array.from(this.clients.values());
    const clientIndex = clients.findIndex(
      (client) => client.clientId === clientId
    );

    if (clientIndex === -1) return clients; // Client not found

    // Move the client to the front
    const [client] = clients.splice(clientIndex, 1);
    clients.unshift(client);

    // Update the clients map to maintain the new order
    this.clients.clear();
    clients.forEach((client) => {
      this.clients.set(client.clientId, client);
    });

    // Update client positions based on new order
    positionClientsInCircle(this.clients);

    // Update gains
    this._calculateGainsAndBroadcast(server);

    return clients;
  }

  /**
   * Move a client to a new position
   */
  moveClient(clientId: string, position: PositionType, server: Server): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.position = position;
    this.clients.set(clientId, client);

    // Update spatial audio config
    this._calculateGainsAndBroadcast(server);
  }

  /**
   * Update the listening source position
   */
  updateListeningSource(position: PositionType, server: Server): void {
    this.listeningSource = position;
    this._calculateGainsAndBroadcast(server);
  }

  /**
   * Start spatial audio interval
   */
  startSpatialAudio(server: Server): void {
    // Don't start if already running
    if (this.intervalId) return;

    // Create a closure for the number of loops
    let loopCount = 0;

    const updateSpatialAudio = () => {
      const clients = Array.from(this.clients.values());
      console.log(
        `ROOM ${this.roomId} LOOP ${loopCount}: Connected clients: ${clients.length}`
      );
      if (clients.length === 0) return;

      // Calculate new position for listening source in a circle
      const radius = 25;
      const centerX = GRID.ORIGIN_X;
      const centerY = GRID.ORIGIN_Y;
      const angle = (loopCount * Math.PI) / 30; // Slow rotation

      const newX = centerX + radius * Math.cos(angle);
      const newY = centerY + radius * Math.sin(angle);

      // Update the listening source position
      this.listeningSource = { x: newX, y: newY };

      // Calculate gains for each client
      const gains = Object.fromEntries(
        clients.map((client) => {
          const gain = calculateGainFromDistanceToSource({
            client: client.position,
            source: this.listeningSource,
          });

          return [
            client.clientId,
            {
              gain,
              rampTime: 0.25,
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
          listeningSource: this.listeningSource,
          gains,
        },
      };

      sendBroadcast({ server, roomId: this.roomId, message });
      loopCount++;
    };

    this.intervalId = setInterval(updateSpatialAudio, 100);
  }

  /**
   * Stop spatial audio interval
   */
  stopSpatialAudio(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get the backup state for this room
   */
  getBackupState() {
    return {
      clients: this.getClients().map((client) => ({
        clientId: client.clientId,
        username: client.username,
      })),
      audioSources: this.audioSources,
    };
  }

  /**
   * Schedule cleanup after a delay
   */
  scheduleCleanup(callback: () => Promise<void>, delayMs: number): void {
    // Cancel any existing timer
    this.cancelCleanup();

    // Schedule new cleanup after specified delay
    this.cleanupTimer = setTimeout(callback, delayMs);
    console.log(`⏱️ Scheduled cleanup for room ${this.roomId} in ${delayMs}ms`);
  }

  /**
   * Cancel pending cleanup
   */
  cancelCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
      console.log(`🚫 Cleanup timer cleared for room ${this.roomId}`);
    }
  }

  /**
   * Clean up room resources (e.g., R2 storage)
   */
  async cleanup(): Promise<void> {
    console.log(`🧹 Starting room cleanup for room ${this.roomId}...`);

    // Stop any running intervals
    this.stopSpatialAudio();

    try {
      const result = await deleteObjectsWithPrefix(`room-${this.roomId}`);
      console.log(
        `✅ Room ${this.roomId} objects deleted: ${result.deletedCount}`
      );
    } catch (error) {
      console.error(`❌ Room ${this.roomId} cleanup failed:`, error);
    }
  }

  /**
   * Calculate gains and broadcast to all clients
   */
  private _calculateGainsAndBroadcast(server: Server): void {
    const clients = Array.from(this.clients.values());

    const gains = Object.fromEntries(
      clients.map((client) => {
        const gain = calculateGainFromDistanceToSource({
          client: client.position,
          source: this.listeningSource,
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
            rampTime: 0.25,
          },
        ];
      })
    );

    // Send the updated gains to all clients
    sendBroadcast({
      server,
      roomId: this.roomId,
      message: {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: epochNow() + 0,
        scheduledAction: {
          type: "SPATIAL_CONFIG",
          listeningSource: this.listeningSource,
          gains,
        },
      },
    });
  }
}
