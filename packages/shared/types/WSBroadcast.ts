import { z } from "zod";
import { 
  PauseActionSchema, 
  PlayActionSchema, 
  PlayYouTubeActionSchema, 
  PauseYouTubeActionSchema, 
  SeekYouTubeActionSchema 
} from "./WSRequest";
import { AudioSourceSchema, PositionSchema, YouTubeSourceSchema } from "./basic";

// ROOM EVENTS

// Client change
const ClientSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  ws: z.any(),
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  position: PositionSchema,
  lastNtpResponse: z.number().default(0), // Last NTP response timestamp
});
export type ClientType = z.infer<typeof ClientSchema>;
const ClientChangeMessageSchema = z.object({
  type: z.literal("CLIENT_CHANGE"),
  clients: z.array(ClientSchema),
});

// Set audio sources
const SetAudioSourcesSchema = z.object({
  type: z.literal("SET_AUDIO_SOURCES"),
  sources: z.array(AudioSourceSchema),
});
export type SetAudioSourcesType = z.infer<typeof SetAudioSourcesSchema>;

// Set YouTube sources
const SetYouTubeSourcesSchema = z.object({
  type: z.literal("SET_YOUTUBE_SOURCES"),
  sources: z.array(YouTubeSourceSchema),
});
export type SetYouTubeSourcesType = z.infer<typeof SetYouTubeSourcesSchema>;

// Set current mode
const SetCurrentModeSchema = z.object({
  type: z.literal("SET_CURRENT_MODE"),
  mode: z.enum(["library", "youtube"]),
});
export type SetCurrentModeType = z.infer<typeof SetCurrentModeSchema>;

// Set selected items
const SetSelectedAudioSchema = z.object({
  type: z.literal("SET_SELECTED_AUDIO"),
  audioUrl: z.string(),
});
export type SetSelectedAudioType = z.infer<typeof SetSelectedAudioSchema>;

const SetSelectedYouTubeSchema = z.object({
  type: z.literal("SET_SELECTED_YOUTUBE"),
  videoId: z.string(),
});
export type SetSelectedYouTubeType = z.infer<typeof SetSelectedYouTubeSchema>;

const RoomEventSchema = z.object({
  type: z.literal("ROOM_EVENT"),
  event: z.discriminatedUnion("type", [
    ClientChangeMessageSchema,
    SetAudioSourcesSchema,
    SetYouTubeSourcesSchema,
    SetCurrentModeSchema,
    SetSelectedAudioSchema,
    SetSelectedYouTubeSchema,
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

export const ScheduledActionSchema = z.object({
  type: z.literal("SCHEDULED_ACTION"),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    PlayYouTubeActionSchema,
    PauseYouTubeActionSchema,
    SeekYouTubeActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
  ]),
});

// Export both broadcast types
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
