import { z } from "zod";
import { PauseActionSchema, PlayActionSchema, PlayYouTubeActionSchema, PauseYouTubeActionSchema, SeekYouTubeActionSchema } from "./WSRequest";
import { AudioSourceSchema, PositionSchema } from "./basic";

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

// SCHEDULED ACTIONS
const NewAudioSourceSchema = z.object({
  type: z.literal("NEW_AUDIO_SOURCE"),
  id: z.string(),
  title: z.string(),
  duration: z.number().positive(),
  thumbnail: z.string().url().optional(),
  addedAt: z.number(),
  addedBy: z.string(),
});
export type NewAudioSourceType = z.infer<typeof NewAudioSourceSchema>;

const YouTubeSourceSchema = z.object({
  type: z.literal("NEW_YOUTUBE_SOURCE"),
  videoId: z.string(),
  title: z.string(),
  thumbnail: z.string().url().optional(),
  duration: z.union([z.number(), z.null()]).optional(),
  channel: z.string().optional(),
  addedAt: z.number(),
  addedBy: z.string(),
});
export type YouTubeSourceType = z.infer<typeof YouTubeSourceSchema>;

const RemoveYouTubeSourceSchema = z.object({
  type: z.literal("REMOVE_YOUTUBE_SOURCE"),
  videoId: z.string(),
  removedBy: z.string(),
});
export type RemoveYouTubeSourceType = z.infer<typeof RemoveYouTubeSourceSchema>;

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

const ScheduledActionSchema = z.object({
  type: z.literal("SCHEDULED_ACTION"),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
    PlayYouTubeActionSchema,
    PauseYouTubeActionSchema,
    SeekYouTubeActionSchema,
  ]),
});

const ModeChangeSchema = z.object({
  type: z.literal("MODE_CHANGE"),
  mode: z.enum(["library", "youtube"]),
});
export type ModeChangeType = z.infer<typeof ModeChangeSchema>;

const SetYouTubeSourcesSchema = z.object({
  type: z.literal("SET_YOUTUBE_SOURCES"),
  sources: z.array(z.object({
    videoId: z.string(),
    title: z.string(),
    thumbnail: z.string().optional(),
    duration: z.number().optional(),
    channel: z.string().optional(),
    addedAt: z.number(),
    addedBy: z.string(),
  })),
});
export type SetYouTubeSourcesType = z.infer<typeof SetYouTubeSourcesSchema>;

const SelectedAudioChangeSchema = z.object({
  type: z.literal("SELECTED_AUDIO_CHANGE"),
  audioId: z.string(),
});
export type SelectedAudioChangeType = z.infer<typeof SelectedAudioChangeSchema>;

const SelectedYouTubeChangeSchema = z.object({
  type: z.literal("SELECTED_YOUTUBE_CHANGE"),
  videoId: z.string(),
});
export type SelectedYouTubeChangeType = z.infer<typeof SelectedYouTubeChangeSchema>;

const PlaybackStateSchema = z.object({
  type: z.literal("PLAYBACK_STATE"),
  isPlaying: z.boolean(),
  currentTime: z.number(),
  lastUpdated: z.number(),
  selectedAudioId: z.string().optional(),
  selectedYouTubeId: z.string().optional(),
});
export type PlaybackStateType = z.infer<typeof PlaybackStateSchema>;

const RoomEventSchema = z.object({
  type: z.literal("ROOM_EVENT"),
  event: z.discriminatedUnion("type", [
    ClientChangeMessageSchema,
    SetAudioSourcesSchema,
    NewAudioSourceSchema,
    YouTubeSourceSchema,
    RemoveYouTubeSourceSchema,
    ModeChangeSchema,
    SetYouTubeSourcesSchema,
    SelectedAudioChangeSchema,
    SelectedYouTubeChangeSchema,
    PlaybackStateSchema,
  ]),
});

// HERE
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
