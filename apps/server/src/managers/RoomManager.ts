import {
  AudioSourceType,
  ChatMessageSchema,
  ChatMessageType,
  ClientDataSchema,
  ClientDataType,
  DiscoveryRoomType,
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
import { SendLocationSchema } from "@beatsync/shared/types/WSRequest";
import { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import { calculateScheduleTimeMs, DEFAULT_CLIENT_RTT_MS } from "../config";
import { deleteObjectsWithPrefix } from "../lib/r2";
import { calculateGainFromDistanceToSource } from "../spatial";
import { sendBroadcast, sendUnicast } from "../utils/responses";
import { positionClientsInCircle } from "../utils/spatial";
import { WSData } from "../utils/websocket";
import { ChatManager } from "./ChatManager";

interface RoomData {
  audioSources: AudioSourceType[];
  clients: ClientDataType[];
  roomId: string;
  intervalId?: NodeJS.Timeout;
  listeningSource: PositionType;
  playbackControlsPermissions: PlaybackControlsPermissionsType;
  globalVolume: number; // Master volume multiplier (0-1)
}

export const ClientCacheBackupSchema = z.record(
  z.string(),
  z.object({ isAdmin: z.boolean() })
);

const RoomPlaybackStateSchema = z.object({
  type: z.enum(["playing", "paused"]),
  audioSource: z.string(), // URL of the audio source
  serverTimeToExecute: z.number(), // When playback started/paused (server time)
  trackPositionSeconds: z.number(), // Position in track when started/paused (seconds)
});
type RoomPlaybackState = z.infer<typeof RoomPlaybackStateSchema>;

const RoomBackupSchema = z.object({
  clientDatas: z.array(ClientDataSchema),
  audioSources: z.array(AudioSourceSchema),
  globalVolume: z.number().min(0).max(1).default(1.0),
  playbackState: RoomPlaybackStateSchema,
  chat: z
    .object({
      messages: z.array(ChatMessageSchema),
      nextMessageId: z.number(),
    })
    .optional(),
});
export type RoomBackupType = z.infer<typeof RoomBackupSchema>;

export const ServerBackupSchema = z.object({
  timestamp: z.number(),
  data: z.object({
    rooms: z.record(z.string(), RoomBackupSchema),
  }),
});
export type ServerBackupType = z.infer<typeof ServerBackupSchema>;

// Default/initial playback state for rooms
const INITIAL_PLAYBACK_STATE: RoomPlaybackState = {
  type: "paused",
  audioSource: "",
  serverTimeToExecute: 0,
  trackPositionSeconds: 0,
};

interface PendingPlayState {
  clientsLoaded: Set<string>;
  timeout: NodeJS.Timeout;
  playAction: PlayActionType;
  initiatorClientId: string;
  server: Server;
}

/**
 * RoomManager handles all operations for a single room.
 * Each room has its own instance of RoomManager.
 */
export class RoomManager {
  private static readonly AUDIO_LOAD_TIMEOUT_MS = 3000; // 3 seconds max wait for audio loading

  private clientData = new Map<string, ClientDataType>(); // map of clientId -> client data
  private wsConnections = new Map<string, ServerWebSocket<WSData>>(); // map of clientId -> ws
  private audioSources: AudioSourceType[] = [];
  private listeningSource: PositionType = {
    x: GRID.ORIGIN_X,
    y: GRID.ORIGIN_Y,
  };
  private intervalId?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private heartbeatCheckInterval?: NodeJS.Timeout;
  private onClientCountChange?: () => void;
  private playbackState: RoomPlaybackState = INITIAL_PLAYBACK_STATE;
  private playbackControlsPermissions: PlaybackControlsPermissionsType =
    "ADMIN_ONLY";
  private globalVolume: number = 1.0; // Default 100% volume
  // Map of trackId to job status
  private activeStreamJobs = new Map<string, { status: string }>();
  private chatManager: ChatManager;

  // Audio loading state for synchronized playback
  private pendingPlay?: PendingPlayState;
  constructor(
    private readonly roomId: string,
    onClientCountChange?: () => void // To update the global # of clients active
  ) {
    this.onClientCountChange = onClientCountChange;
    this.chatManager = new ChatManager({ roomId });
  }

  /**
   * Get the room ID
   */
  getRoomId(): string {
    return this.roomId;
  }

  clearAudioLoadingState(): void {
    if (!this.pendingPlay) return;
    // Clear the timeout
    if (this.pendingPlay.timeout) {
      clearTimeout(this.pendingPlay.timeout);
    }

    // Clear the pending play
    this.pendingPlay = undefined;
  }

  /**
   * Initiate audio source loading for all clients before playback
   */
  initiateAudioSourceLoad(
    playAction: PlayActionType,
    initiatorClientId: string,
    server: Server
  ): void {
    // Clear any existing loading state
    this.clearAudioLoadingState();

    // Find the audio source to load
    const audioSource = this.audioSources.find(
      (source) => source.url === playAction.audioSource
    );

    if (!audioSource) {
      console.warn(
        `Cannot load non-existent audio source: ${playAction.audioSource}`
      );
      return;
    }

    // Set up timeout to execute play even if some clients don't respond
    const timeout = setTimeout(() => {
      console.log(
        `Audio loading timeout reached after ${RoomManager.AUDIO_LOAD_TIMEOUT_MS}ms. Proceeding with play.`
      );
      this.executeScheduledPlay(server);
    }, RoomManager.AUDIO_LOAD_TIMEOUT_MS);

    // Store pending play state
    this.pendingPlay = {
      clientsLoaded: new Set([initiatorClientId]),
      timeout,
      playAction,
      initiatorClientId,
      server,
    };

    // Broadcast LOAD_AUDIO_SOURCE to all clients
    sendBroadcast({
      server,
      roomId: this.roomId,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "LOAD_AUDIO_SOURCE",
          audioSourceToPlay: audioSource,
        },
      },
    });

    console.log(
      `Initiated audio loading for ${audioSource.url} in room ${this.roomId}`
    );
  }

  allClientsLoadedPendingSource(): boolean {
    if (!this.pendingPlay) {
      console.warn(`Room ${this.roomId}: No pending play state found`);
      return false;
    }

    const clientCount = this.getClients().length;
    // Don't start playback if there are no clients
    if (clientCount === 0) {
      return false;
    }

    return this.pendingPlay.clientsLoaded.size === clientCount;
  }

  /**
   * Process when a client reports they've loaded the audio source
   */
  processClientLoadedAudioSource(clientId: string, server: Server): void {
    if (!this.pendingPlay) {
      console.warn(
        `Room ${this.roomId}: Client ${clientId} reported audio source loaded, but no pending play state found`
      );
      return;
    }

    // Add client to loaded set
    this.pendingPlay.clientsLoaded.add(clientId);

    const loadedCount = this.pendingPlay.clientsLoaded.size;
    const totalCount = this.getClients().length;
    console.log(
      `Room ${this.roomId}: ${loadedCount}/${totalCount} clients loaded audio`
    );

    // Check if all active clients have loaded
    if (this.allClientsLoadedPendingSource()) {
      console.log(
        `Room ${this.roomId}: All clients loaded. Starting playback.`
      );
      this.executeScheduledPlay(server);
    }
  }

  /**
   * Execute the scheduled play after audio loading is complete
   * Could be called by either the timeout or explicitly because all clients loaded
   */
  private executeScheduledPlay(server: Server): void {
    if (!this.pendingPlay) {
      return;
    }

    const { playAction } = this.pendingPlay;

    // Clear everything here
    this.clearAudioLoadingState();

    // Use dynamic scheduling based on max client RTT
    const serverTimeToExecute = this.getScheduledExecutionTime();

    // Update playback state
    const success = this.updatePlaybackSchedulePlay(
      playAction,
      serverTimeToExecute
    );

    if (success) {
      // Send the scheduled play action
      sendBroadcast({
        server,
        roomId: this.roomId,
        message: {
          type: "SCHEDULED_ACTION",
          scheduledAction: playAction,
          serverTimeToExecute,
        },
      });

      console.log(
        `Executed scheduled play for ${playAction.audioSource} in room ${this.roomId}`
      );
    } else {
      console.warn(
        `Failed to execute play - track may have been removed: ${playAction.audioSource}`
      );
    }
  }

  getAudioSources(): AudioSourceType[] {
    return this.audioSources;
  }

  getPlaybackControlsPermissions(): PlaybackControlsPermissionsType {
    return this.playbackControlsPermissions;
  }

  getPlaybackState(): RoomPlaybackState {
    return this.playbackState;
  }

  /**
   * Add a client to the room
   */
  addClient(ws: ServerWebSocket<WSData>): void {
    // Cancel any pending cleanup since room is active again
    this.cancelCleanup();

    const { username, clientId } = ws.data;

    // Check if this client has cached data from a previous connection
    const clientData: ClientDataType = {
      joinedAt: Date.now(),
      username,
      clientId,
      isAdmin: false,
      rtt: 0,
      position: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y - 25 }, // Initial position at center
      lastNtpResponse: Date.now(), // Initialize last NTP response time
    };

    const cachedClient = this.clientData.get(clientId);

    // Restore some specific fields.
    if (cachedClient) {
      clientData.username = cachedClient.username;
      clientData.location = cachedClient.location;
      clientData.isAdmin = cachedClient.isAdmin;
      clientData.joinedAt = cachedClient.joinedAt;
    }

    // Always ensure that the first client to join an empty room becomes admin regardless
    if (this.wsConnections.size === 0) {
      clientData.isAdmin = true;
    }

    this.clientData.set(clientId, clientData);
    this.wsConnections.set(clientId, ws);

    positionClientsInCircle(this.getClients());

    // Idempotently start heartbeat checking
    this.startHeartbeatChecking();

    // Notify that client count changed
    this.onClientCountChange?.();
  }

  /**
   * Remove a client from the room
   */
  removeClient(clientId: string): void {
    // Only remove from wsConnections, keep clientData for rejoin scenarios
    this.wsConnections.delete(clientId);

    const activeClients = this.getClients();
    // Reposition remaining clients if any
    if (activeClients.length > 0) {
      // Always check to ensure there is at least one admin
      positionClientsInCircle(activeClients);

      // Check if any admins remain after removing this client
      const remainingAdmins = activeClients.filter((client) => client.isAdmin);

      // If no admins remain, randomly select a new admin
      if (remainingAdmins.length === 0) {
        const randomIndex = Math.floor(Math.random() * activeClients.length);
        const newAdmin = activeClients[randomIndex];

        if (newAdmin) {
          newAdmin.isAdmin = true;
          this.clientData.set(newAdmin.clientId, newAdmin);
          console.log(
            `✨ Automatically promoted ${newAdmin.username} (${newAdmin.clientId}) to admin in room ${this.roomId}`
          );
        }
      }
    } else {
      // Stop heartbeat checking if no clients remain
      this.stopHeartbeatChecking();
    }

    // Check if we were waiting for this client to load audio
    if (this.pendingPlay) {
      // Remove client from loaded set if they were there
      this.pendingPlay.clientsLoaded.delete(clientId);

      // Recheck if all remaining clients have loaded
      if (this.allClientsLoadedPendingSource()) {
        console.log(
          `Client left during loading. All remaining clients loaded. Starting playback.`
        );
        // Use the stored server reference
        this.executeScheduledPlay(this.pendingPlay.server);
      }
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
    const client = this.clientData.get(targetClientId);
    if (!client) return;
    client.isAdmin = isAdmin;
    this.clientData.set(targetClientId, client);
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

  removeAudioSources(urls: string[]): {
    updated: AudioSourceType[];
    removedCurrent: boolean;
    removedUrl?: string;
  } {
    const before = this.audioSources.length;
    const urlSet = new Set(urls);

    // Check if current playback url is being removed
    const removingCurrent =
      this.playbackState.type === "playing" &&
      urlSet.has(this.playbackState.audioSource);

    const removedUrl = removingCurrent
      ? this.playbackState.audioSource
      : undefined;

    this.audioSources = this.audioSources.filter((s) => !urlSet.has(s.url));

    // Reset playback state if we removed the currently playing track
    if (removingCurrent) {
      console.log(
        `Room ${this.roomId}: Currently playing track was removed. Resetting playback state.`
      );
      this.playbackState = INITIAL_PLAYBACK_STATE;
    }

    const after = this.audioSources.length;
    if (before !== after) {
      console.log(
        `Removed ${before - after} sources from room ${this.roomId}: `
      );
    }
    return {
      updated: this.audioSources,
      removedCurrent: removingCurrent,
      removedUrl,
    };
  }

  /**
   * Get all clients in the room
   */
  getClients(): ClientDataType[] {
    // Only return clients that have an active WebSocket connection
    return Array.from(this.clientData.values()).filter((client) =>
      this.wsConnections.has(client.clientId)
    );
  }

  /**
   * Check if the room has any active clients based on recent NTP heartbeats
   * This is more reliable than checking WebSocket readyState which can be inconsistent
   */
  hasActiveConnections(): boolean {
    const now = Date.now();
    const clients = this.getClients();

    for (const client of clients) {
      // A client is considered active if they've sent an NTP request within the timeout window
      // This is more reliable than WebSocket readyState during network fluctuations
      const timeSinceLastResponse = now - client.lastNtpResponse;
      if (timeSinceLastResponse <= NTP_CONSTANTS.RESPONSE_TIMEOUT_MS) {
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
      clients: this.getClients(),
      roomId: this.roomId,
      intervalId: this.intervalId,
      listeningSource: this.listeningSource,
      playbackControlsPermissions: this.playbackControlsPermissions,
      globalVolume: this.globalVolume,
    };
  }

  /**
   * Get room statistics
   */
  getStats(): RoomType {
    return {
      roomId: this.roomId,
      clientCount: this.getClients().length,
      audioSourceCount: this.audioSources.length,
      hasSpatialAudio: !!this.intervalId,
    };
  }

  getNumClients(): number {
    return this.getClients().length;
  }

  /**
   * Stream job management methods
   * Idempotently adds a stream job for a track if not already active.
   */
  addStreamJob(trackId: string): void {
    this.activeStreamJobs.set(trackId, { status: "active" });
  }

  removeStreamJob(trackId: string): void {
    this.activeStreamJobs.delete(trackId);
  }

  hasActiveStreamJob(trackId: string): boolean {
    return this.activeStreamJobs.has(trackId);
  }

  getActiveStreamJobCount(): number {
    return this.activeStreamJobs.size;
  }

  /**
   * Add a chat message to the room
   */
  addChatMessage({
    clientId,
    text,
  }: {
    clientId: string;
    text: string;
  }): ChatMessageType {
    const client = this.clientData.get(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found in room ${this.roomId}`);
    }

    return this.chatManager.addMessage({ client, text });
  }

  /**
   * Get chat history
   */
  getFullChatHistory(): ChatMessageType[] {
    return this.chatManager.getFullHistory();
  }

  /**
   * Get the newest message ID
   */
  getNewestChatId(): number {
    return this.chatManager.getNewestId();
  }

  /**
   * Get the maximum RTT among all connected clients
   */
  getMaxClientRTT(): number {
    const activeClients = this.getClients();
    if (activeClients.length === 0) return DEFAULT_CLIENT_RTT_MS; // Default RTT if no clients

    let maxRTT = DEFAULT_CLIENT_RTT_MS; // Minimum default RTT
    for (const client of activeClients) {
      if (client.rtt > maxRTT) {
        maxRTT = client.rtt;
      }
    }

    return maxRTT;
  }

  /**
   * Get the scheduled execution time based on dynamic RTT
   * @returns Server timestamp when the action should be executed
   */
  getScheduledExecutionTime(
    opts: { extraOffsetMs: number } = { extraOffsetMs: 0 }
  ): number {
    const maxRTT = this.getMaxClientRTT();
    const scheduleDelayMs = calculateScheduleTimeMs(maxRTT);
    console.log(
      `Scheduling with dynamic delay: ${scheduleDelayMs}ms (max RTT: ${maxRTT}ms)`
    );
    return epochNow() + scheduleDelayMs + opts.extraOffsetMs;
  }

  /**
   * Receive an NTP request from a client
   */
  processNTPRequestFrom(clientId: string, clientRTT?: number): void {
    const client = this.clientData.get(clientId);
    if (!client) return;
    client.lastNtpResponse = Date.now();

    // Update RTT if provided (using exponential moving average for smoothing)
    if (clientRTT !== undefined && clientRTT > 0) {
      const alpha = 0.2; // Smoothing factor
      client.rtt =
        client.rtt > 0
          ? client.rtt * (1 - alpha) + clientRTT * alpha // Exponential moving average
          : clientRTT; // First measurement
    }

    this.clientData.set(clientId, client);
  }

  /**
   * Reorder clients, moving the specified client to the front
   */
  reorderClients(clientId: string, server: Server): ClientDataType[] {
    const clients = this.getClients();
    const clientIndex = clients.findIndex(
      (client) => client.clientId === clientId
    );

    if (clientIndex === -1) return clients; // Client not found

    // Move the client to the front
    const [client] = clients.splice(clientIndex, 1);
    clients.unshift(client);

    // Update the clients map to maintain the new order
    this.clientData.clear();
    clients.forEach((client) => {
      this.clientData.set(client.clientId, client);
    });

    // Update client positions based on new order
    positionClientsInCircle(this.getClients());

    // Update gains
    this._calculateGainsAndBroadcast(server);

    return clients;
  }

  /**
   * Move a client to a new position
   */
  moveClient(clientId: string, position: PositionType, server: Server): void {
    const client = this.clientData.get(clientId);
    if (!client) return;

    client.position = position;
    this.clientData.set(clientId, client);

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
   * Set global volume for all clients
   */
  setGlobalVolume(volume: number, server: Server): void {
    this.globalVolume = Math.max(0, Math.min(1, volume)); // Clamp 0-1

    sendBroadcast({
      server,
      roomId: this.roomId,
      message: {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: epochNow(), // Execute ASAP
        scheduledAction: {
          type: "GLOBAL_VOLUME_CONFIG",
          volume: this.globalVolume,
          rampTime: 0.1,
        },
      },
    });
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
      const clients = this.getClients();
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
          const spatialGain = calculateGainFromDistanceToSource({
            client: client.position,
            source: this.listeningSource,
          });

          // Send pure spatial gain - client will apply global volume
          return [
            client.clientId,
            {
              gain: spatialGain,
              rampTime: 0.25,
            },
          ];
        })
      );

      // Send the updated configuration to all clients
      const message: WSBroadcastType = {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: this.getScheduledExecutionTime(),
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
  ): boolean {
    // Validate that the audio source exists in the room (if provided)
    // Pause can reference a track that might have been deleted, which is ok
    // But we should validate if the track is specified
    if (pauseSchema.audioSource) {
      const trackExists = this.audioSources.some(
        (source) => source.url === pauseSchema.audioSource
      );

      if (!trackExists) {
        console.warn(
          `Room ${this.roomId}: Attempted to pause non-existent track: ${pauseSchema.audioSource}`
        );
        // For pause, we'll still update but with empty audioSource
        this.playbackState = {
          type: "paused",
          audioSource: "",
          trackPositionSeconds: 0,
          serverTimeToExecute: serverTimeToExecute,
        };
        return false;
      }
    }

    this.playbackState = {
      type: "paused",
      audioSource: pauseSchema.audioSource,
      trackPositionSeconds: pauseSchema.trackTimeSeconds,
      serverTimeToExecute: serverTimeToExecute,
    };
    return true;
  }

  updatePlaybackSchedulePlay(
    playSchema: PlayActionType,
    serverTimeToExecute: number
  ): boolean {
    // Validate that the audio source exists in the room
    const trackExists = this.audioSources.some(
      (source) => source.url === playSchema.audioSource
    );

    if (!trackExists) {
      console.warn(
        `Room ${this.roomId}: Attempted to play non-existent track: ${playSchema.audioSource}`
      );
      return false;
    }

    this.playbackState = {
      type: "playing",
      audioSource: playSchema.audioSource,
      trackPositionSeconds: playSchema.trackTimeSeconds,
      serverTimeToExecute: serverTimeToExecute,
    };
    return true;
  }

  syncClient(ws: ServerWebSocket<WSData>): void {
    // A client has joined late, and needs to sync with the room
    // Predict where the playback state will be after the dynamic scheduling delay
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

    // Use dynamic scheduling based on max client RTT
    const serverTimeToExecute = this.getScheduledExecutionTime({
      extraOffsetMs: 1500, // Another extra 1.5 seconds to sync
    });

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

  processIP({
    ws,
    message: { location },
  }: {
    ws: ServerWebSocket<WSData>;
    message: z.infer<typeof SendLocationSchema>;
  }): void {
    const client = this.clientData.get(ws.data.clientId);
    if (!client) return;

    client.location = location;

    this.clientData.set(client.clientId, client);
  }

  getClient(clientId: string): ClientDataType | undefined {
    return this.clientData.get(clientId);
  }

  /**
   * Get the backup state for this room
   */
  createBackup(): RoomBackupType {
    return {
      clientDatas: Array.from(this.clientData.values()),
      audioSources: this.audioSources,
      globalVolume: this.globalVolume,
      playbackState: this.playbackState,
      chat: {
        messages: this.chatManager.getFullHistory(),
        nextMessageId: this.chatManager.getNextMessageId(),
      },
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
    const clients = this.getClients();

    const gains = Object.fromEntries(
      clients.map((client) => {
        const spatialGain = calculateGainFromDistanceToSource({
          client: client.position,
          source: this.listeningSource,
        });

        // Send pure spatial gain - client will apply global volume
        console.log(
          `Client ${client.username} at (${client.position.x}, ${
            client.position.y
          }) - spatial gain: ${spatialGain.toFixed(
            2
          )} (global volume ${this.globalVolume.toFixed(2)} applied on client)`
        );
        return [
          client.clientId,
          {
            gain: spatialGain,
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
      const activeClients = this.getClients();
      activeClients.forEach((client) => {
        const timeSinceLastResponse = now - client.lastNtpResponse;

        if (timeSinceLastResponse > NTP_CONSTANTS.RESPONSE_TIMEOUT_MS) {
          console.warn(
            `⚠️ Client ${client.clientId} in room ${this.roomId} has not responded for ${timeSinceLastResponse}ms`
          );
          staleClients.push(client.clientId);
        }
      });

      // Close stale client connections
      staleClients.forEach((clientId) => {
        const client = this.clientData.get(clientId);
        if (client) {
          console.log(
            `🔌 Disconnecting stale client ${clientId} from room ${this.roomId}`
          );
          // Close the WebSocket connection
          // The onClose handler will call removeClient() when the connection actually closes
          try {
            const ws = this.wsConnections.get(clientId);
            if (!ws) {
              console.error(
                `❌ No WebSocket connection found for client ${clientId} in room ${this.roomId}`
              );
              // If there's no WebSocket, we should clean up the orphaned client data
              // Note: we don't have server reference here, so loading state won't be checked
              this.removeClient(clientId);
              return;
            }
            // Close the WebSocket - this will trigger the onClose handler
            // which will properly remove the client from the room
            ws.close(1000, "Connection timeout - no heartbeat response");
          } catch (error) {
            console.error(
              `Error closing WebSocket for client ${clientId}:`,
              error
            );
            // If closing failed, still try to clean up
            // Note: we don't have server reference here, so loading state won't be checked
            this.removeClient(clientId);
          }
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

  // For active rooms display endpoint:
  serialize(): DiscoveryRoomType {
    return {
      roomId: this.roomId,
      clients: this.getClients(),
      audioSources: this.audioSources,
      playbackState: this.playbackState,
    };
  }

  restoreClientData(clientData: ClientDataType[]): void {
    clientData.forEach((client) => {
      this.clientData.set(client.clientId, client);
    });
  }

  restorePlaybackState(playbackState: RoomPlaybackState): void {
    this.playbackState = playbackState;
  }

  /**
   * Restore chat history from backup
   */
  restoreChatHistory(chat: {
    messages: ChatMessageType[];
    nextMessageId: number;
  }): void {
    if (chat.messages.length > 0) {
      this.chatManager.restoreMessages(chat.messages, chat.nextMessageId);
    }
  }

  reorderAudioSource(newOrder: AudioSourceType[]): void | Error {
    if( newOrder.length !== this.audioSources.length) {
      console.warn(`Attempted to reorder audio sources with mismatched length in room ${this.roomId}`);
      return new Error(`Mismatched audio sources length`);
    }

    this.audioSources = newOrder;
  }
}
