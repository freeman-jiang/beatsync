import { z } from "zod";
import { LOW_PASS_CONSTANTS } from "../constants";
import {
  LocationSchema,
  PauseActionSchema,
  PlayActionSchema,
  SetPlaybackControlsSchema,
} from "./WSRequest";
import { AudioSourceSchema, ChatMessageSchema, PositionSchema } from "./basic";

// Server -> client message types (mirrors ClientActionEnum for client -> server)
export const ServerActionEnum = z.enum([
  "ROOM_EVENT", // Room state changes (clients, audio sources, chat, ...)
  "SCHEDULED_ACTION", // Time-synchronized actions (play, pause, spatial config, ...)
  "STREAM_JOB_UPDATE", // Active stream job count changed
  "DEMO_USER_COUNT", // Demo mode: connected user count
  "DEMO_AUDIO_READY_COUNT", // Demo mode: clients with audio loaded
  "NTP_RESPONSE", // Reply to an NTP_REQUEST time sync probe
  "SEARCH_RESPONSE", // Music search results
  "LIVENESS_PING", // Liveness probe; client replies with LIVENESS_PONG
]);

// Client change
export const ClientDataSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  compensationMs: z.number().nonnegative().default(0), // Client's local compensation (outputLatency + nudge)
  nudgeMs: z.number().default(0), // Manual timing nudge set by the user
  position: PositionSchema,
  lastNtpResponse: z.number().default(0), // Last NTP response timestamp
  lastSeenAt: z.number().default(0), // Last message of any kind (liveness; server-managed)
  lastLivenessPingAt: z.number().default(0), // When the server last sent a LIVENESS_PING (server-managed)
  isAdmin: z.boolean().default(false), // Admin status
  isCreator: z.boolean().default(false), // Site creator badge
  location: LocationSchema.optional(),
  joinedAt: z.number(), // Timestamp when the client joined the room
});
export type ClientDataType = z.infer<typeof ClientDataSchema>;
const ClientChangeMessageSchema = z.object({
  type: z.literal("CLIENT_CHANGE"),
  clients: z.array(ClientDataSchema),
});

// Set audio sources
const SetAudioSourcesSchema = z.object({
  type: z.literal("SET_AUDIO_SOURCES"),
  sources: z.array(AudioSourceSchema),
  currentAudioSource: z.string().optional(),
});
export type SetAudioSourcesType = z.infer<typeof SetAudioSourcesSchema>;

// Chat update event
const ChatUpdateSchema = z.object({
  type: z.literal("CHAT_UPDATE"),
  messages: z.array(ChatMessageSchema),
  isFullSync: z.boolean(), // true = replace all, false = append
  newestId: z.number(), // Highest message ID included
});
export type ChatUpdateType = z.infer<typeof ChatUpdateSchema>;

// Load audio source update event
const LoadAudioSourceSchema = z.object({
  type: z.literal("LOAD_AUDIO_SOURCE"),
  audioSourceToPlay: AudioSourceSchema,
});
export type LoadAudioSourceType = z.infer<typeof LoadAudioSourceSchema>;

const RoomEventSchema = z.object({
  type: z.literal(ServerActionEnum.enum.ROOM_EVENT),
  event: z.discriminatedUnion("type", [
    ClientChangeMessageSchema,
    SetAudioSourcesSchema,
    SetPlaybackControlsSchema,
    ChatUpdateSchema,
    LoadAudioSourceSchema,
  ]),
});

// SCHEDULED ACTIONS
const SpatialConfigSchema = z.object({
  type: z.literal("SPATIAL_CONFIG"),
  gains: z.record(
    z.string(),
    z.object({ gain: z.number().min(0).max(1), rampTime: z.number() })
  ),
  listeningSource: PositionSchema,
});

export type SpatialConfigType = z.infer<typeof SpatialConfigSchema>;

const StopSpatialAudioSchema = z.object({
  type: z.literal("STOP_SPATIAL_AUDIO"),
});
export type StopSpatialAudioType = z.infer<typeof StopSpatialAudioSchema>;

const GlobalVolumeConfigSchema = z.object({
  type: z.literal("GLOBAL_VOLUME_CONFIG"),
  volume: z.number().min(0).max(1),
  rampTime: z.number(), // smooth transition
});
export type GlobalVolumeConfigType = z.infer<typeof GlobalVolumeConfigSchema>;

const MetronomeConfigSchema = z.object({
  type: z.literal("METRONOME_CONFIG"),
  enabled: z.boolean(),
});
export type MetronomeConfigType = z.infer<typeof MetronomeConfigSchema>;

const LowPassConfigSchema = z.object({
  type: z.literal("LOW_PASS_CONFIG"),
  freq: z.number().min(LOW_PASS_CONSTANTS.MIN_FREQ).max(LOW_PASS_CONSTANTS.MAX_FREQ),
  rampTime: z.number(),
});
export type LowPassConfigType = z.infer<typeof LowPassConfigSchema>;

const StreamJobUpdateSchema = z.object({
  type: z.literal(ServerActionEnum.enum.STREAM_JOB_UPDATE),
  activeJobCount: z.number().nonnegative(),
});
export type StreamJobUpdateType = z.infer<typeof StreamJobUpdateSchema>;

export const ScheduledActionSchema = z.object({
  type: z.literal(ServerActionEnum.enum.SCHEDULED_ACTION),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
    GlobalVolumeConfigSchema,
    MetronomeConfigSchema,
    LowPassConfigSchema,
  ]),
});

const DemoUserCountSchema = z.object({
  type: z.literal(ServerActionEnum.enum.DEMO_USER_COUNT),
  count: z.number().nonnegative(),
});
export type DemoUserCountType = z.infer<typeof DemoUserCountSchema>;

const DemoAudioReadyCountSchema = z.object({
  type: z.literal(ServerActionEnum.enum.DEMO_AUDIO_READY_COUNT),
  count: z.number().nonnegative(),
});
export type DemoAudioReadyCountType = z.infer<typeof DemoAudioReadyCountSchema>;

// Export both broadcast types
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
  StreamJobUpdateSchema,
  DemoUserCountSchema,
  DemoAudioReadyCountSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
