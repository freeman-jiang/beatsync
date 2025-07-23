import {
  AudioSourceType,
  ClientType,
  epochNow,
  NTP_CONSTANTS,
  PauseActionType,
  PlayActionType,
  PlaybackControlsPermissionsEnum,
  PlaybackControlsPermissionsType,
  PositionType,
  RoomType,
  WSBroadcastType,
} from "@beatsync/shared";
import { AudioSourceSchema, GRID } from "@beatsync/shared/types/basic";
import { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import { SCHEDULE_TIME_MS } from "../config";
import { deleteObjectsWithPrefix } from "../lib/r2";
import { calculateGainFromDistanceToSource } from "../spatial";
import { sendBroadcast, sendUnicast } from "../utils/responses";
import { positionClientsInCircle } from "../utils/spatial";
import { WSData } from "../utils/websocket";

interface RoomData {
  audioSources: AudioSourceType[];
  clients: Map<string, ClientType>;
  roomId: string;
  intervalId?: NodeJS.Timeout;
  listeningSource: PositionType;
  playbackControlsPermissions: PlaybackControlsPermissionsType;
}

// Define Zod schemas for backup validation
const BackupClientSchema = z.object({
  clientId: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
});

const RoomBackupSchema = z.object({
  clients: z.array(BackupClientSchema),
  audioSources: z.array(AudioSourceSchema),
});
export type RoomBackupType = z.infer<typeof RoomBackupSchema>;

export const ServerBackupSchema = z.object({
  timestamp: z.number(),
  data: z.object({
    rooms: z.record(z.string(), RoomBackupSchema),
  }),
});
export type ServerBackupType = z.infer<typeof ServerBackupSchema>;

const RoomPlaybackStateSchema = z.object({
  type: z.enum(["playing", "paused"]),
  audioSource: z.string(), // URL of the audio source
  serverTimeToExecute: z.number(), // When playback started/paused (server time)
  trackPositionSeconds: z.number(), // Position in track when started/paused (seconds)
});
type RoomPlaybackState = z.infer<typeof RoomPlaybackStateSchema>;

/**
 * RoomManager handles all operations for a single room.
 * Each room has its own instance of RoomManager.
 */
export class RoomManager {
  private clients = new Map<string, ClientType>();
  private audioSources: AudioSourceType[] = [];
  private listeningSource: PositionType = {
    x: GRID.ORIGIN_X,
    y: GRID.ORIGIN_Y,
  };
  private intervalId?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private heartbeatCheckInterval?: NodeJS.Timeout;
  private onClientCountChange?: () => void;
  private playbackState: RoomPlaybackState = {
    type: "paused",
    audioSource: "",
    serverTimeToExecute: 0,
    trackPositionSeconds: 0,
  };
  private playbackControlsPermissions: PlaybackControlsPermissionsType =
    "EVERYONE";

  constructor(
    private readonly roomId: string,
    onClientCountChange?: () => void // To update the global # of clients active
  ) {
    this.onClientCountChange = onClientCountChange;
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

    // The first client to join a room will always be an admin
    const isAdmin = this.clients.size === 0;

    // Add the new client
    this.clients.set(clientId, {
      username,
      clientId,
      ws,
      isAdmin,
      rtt: 0,
      position: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y - 25 }, // Initial position at center
      lastNtpResponse: Date.now(), // Initialize last NTP response time
    });

    positionClientsInCircle(this.clients);

    // Idempotently start heartbeat checking
    this.startHeartbeatChecking();

    // Notify that client count changed
    this.onClientCountChange?.();
  }

  /**
   * Remove a client from the room
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);

    // Reposition remaining clients if any
    if (this.clients.size > 0) {
      positionClientsInCircle(this.clients);
    } else {
      // Stop heartbeat checking if no clients remain
      this.stopHeartbeatChecking();
    }

    // Notify that client count changed
    this.onClientCountChange?.();
  }

  setAdmin({
    targetClientId,
    isAdmin,
  }: {
    targetClientId: string;
    isAdmin: boolean;
  }): void {
    const client = this.clients.get(targetClientId);
    if (!client) return;
    client.isAdmin = isAdmin;
    this.clients.set(targetClientId, client);
  }

  setPlaybackControls(
    permissions: z.infer<typeof PlaybackControlsPermissionsEnum>
  ): void {
    this.playbackControlsPermissions = permissions;
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
      playbackControlsPermissions: this.playbackControlsPermissions,
    };
  }

  /**
   * Get room statistics
   */
  getStats(): RoomType {
    return {
      roomId: this.roomId,
      clientCount: this.clients.size,
      audioSourceCount: this.audioSources.length,
      hasSpatialAudio: !!this.intervalId,
    };
  }

  getNumClients(): number {
    return this.clients.size;
  }

  /**
   * Receive an NTP request from a client
   */
  processNTPRequestFrom(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.lastNtpResponse = Date.now();
    this.clients.set(clientId, client);
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

  updatePlaybackSchedulePause(
    pauseSchema: PauseActionType,
    serverTimeToExecute: number
  ) {
    this.playbackState = {
      type: "paused",
      audioSource: pauseSchema.audioSource,
      trackPositionSeconds: pauseSchema.trackTimeSeconds,
      serverTimeToExecute: serverTimeToExecute,
    };
  }

  updatePlaybackSchedulePlay(
    playSchema: PlayActionType,
    serverTimeToExecute: number
  ) {
    this.playbackState = {
      type: "playing",
      audioSource: playSchema.audioSource,
      trackPositionSeconds: playSchema.trackTimeSeconds,
      serverTimeToExecute: serverTimeToExecute,
    };
  }

  syncClient(ws: ServerWebSocket<WSData>): void {
    // A client has joined late, and needs to sync with the room
    // Predict where the playback state will be in epochNow() + SCHEDULE_TIME_MS
    // And make client play at that position then

    // Determine if we are currently playing or paused
    if (this.playbackState.type === "paused") {
      return; // Nothing to do - client will play on next scheduled action
    }

    const serverTimeWhenPlaybackStarted =
      this.playbackState.serverTimeToExecute;
    const trackPositionSecondsWhenPlaybackStarted =
      this.playbackState.trackPositionSeconds;
    const now = epochNow();
    const serverTimeToExecute = now + SCHEDULE_TIME_MS;

    // Calculate how much time has elapsed since playback started
    const timeElapsedSincePlaybackStarted = now - serverTimeWhenPlaybackStarted;

    // Calculate how much time will have elapsed by the time the client responds
    // to the sync response
    const timeElapsedAtExecution =
      serverTimeToExecute - serverTimeWhenPlaybackStarted;

    // Convert to seconds and add to the starting position
    const resumeTrackTimeSeconds =
      trackPositionSecondsWhenPlaybackStarted + timeElapsedAtExecution / 1000;
    console.log(
      `Syncing late client: track started at ${trackPositionSecondsWhenPlaybackStarted.toFixed(
        2
      )}s, ` +
        `${(timeElapsedSincePlaybackStarted / 1000).toFixed(2)}s elapsed, ` +
        `will be at ${resumeTrackTimeSeconds.toFixed(2)}s when client starts`
    );

    sendUnicast({
      ws,
      message: {
        type: "SCHEDULED_ACTION",
        scheduledAction: {
          type: "PLAY",
          audioSource: this.playbackState.audioSource,
          trackTimeSeconds: resumeTrackTimeSeconds, // Use the calculated position
        },
        serverTimeToExecute: serverTimeToExecute,
      },
    });
  }

  getClient(clientId: string): ClientType | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get the backup state for this room
   */
  createBackup(): RoomBackupType {
    return {
      clients: this.getClients().map((client) => ({
        clientId: client.clientId,
        username: client.username,
        isAdmin: client.isAdmin,
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
    this.stopHeartbeatChecking();

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

  /**
   * Start checking for stale client connections
   */
  private startHeartbeatChecking(): void {
    // Don't start if already running
    if (this.heartbeatCheckInterval) return;

    console.log(`💓 Starting heartbeat for room ${this.roomId}`);

    // Check heartbeats every second
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      const staleClients: string[] = [];

      // Check each client's last heartbeat
      this.clients.forEach((client, clientId) => {
        const timeSinceLastResponse = now - client.lastNtpResponse;

        if (timeSinceLastResponse > NTP_CONSTANTS.RESPONSE_TIMEOUT_MS) {
          console.warn(
            `⚠️ Client ${clientId} in room ${this.roomId} has not responded for ${timeSinceLastResponse}ms`
          );
          staleClients.push(clientId);
        }
      });

      // Remove stale clients
      staleClients.forEach((clientId) => {
        const client = this.clients.get(clientId);
        if (client) {
          console.log(
            `🔌 Disconnecting stale client ${clientId} from room ${this.roomId}`
          );
          // Close the WebSocket connection
          try {
            const ws: ServerWebSocket<WSData> = client.ws;
            ws.close(1000, "Connection timeout - no heartbeat response");
          } catch (error) {
            console.error(
              `Error closing WebSocket for client ${clientId}:`,
              error
            );
          }
          // Remove from room (the close event handler should also call removeClient)
          this.removeClient(clientId);
        }
      });
    }, NTP_CONSTANTS.STEADY_STATE_INTERVAL_MS);
  }

  /**
   * Stop checking for stale client connections
   */
  private stopHeartbeatChecking(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = undefined;
      console.log(`💔 Stopped heartbeat checking for room ${this.roomId}`);
    }
  }
}
