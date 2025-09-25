import { z } from "zod";
import {
  LocationSchema,
  PauseActionSchema,
  PlayActionSchema,
  SetPlaybackControlsSchema,
} from "./WSRequest";
import { AudioSourceSchema, ChatMessageSchema, PositionSchema } from "./basic";

// Client change
export const ClientDataSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  position: PositionSchema,
  lastNtpResponse: z.number().default(0), // Last NTP response timestamp
  isAdmin: z.boolean().default(false), // Admin status
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
  type: z.literal("ROOM_EVENT"),
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

const StreamJobUpdateSchema = z.object({
  type: z.literal("STREAM_JOB_UPDATE"),
  activeJobCount: z.number().nonnegative(),
});
export type StreamJobUpdateType = z.infer<typeof StreamJobUpdateSchema>;

export const ScheduledActionSchema = z.object({
  type: z.literal("SCHEDULED_ACTION"),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
    GlobalVolumeConfigSchema,
  ]),
});

// Export both broadcast types
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
  StreamJobUpdateSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
