import { z } from "zod";
import { PauseActionSchema, PlayActionSchema, PlayYouTubeActionSchema, PauseYouTubeActionSchema, SeekYouTubeActionSchema } from "./WSRequest";
import { PositionSchema } from "./basic";

const ClientSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  ws: z.any(),
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  position: PositionSchema,
});
export type ClientType = z.infer<typeof ClientSchema>;

const ClientChangeMessageSchema = z.object({
  type: z.literal("CLIENT_CHANGE"),
  clients: z.array(ClientSchema),
});

const AudioSourceSchema = z.object({
  type: z.literal("NEW_AUDIO_SOURCE"),
  id: z.string(),
  title: z.string(),
  duration: z.number().positive(),
  thumbnail: z.string().url().optional(),
  addedAt: z.number(),
  addedBy: z.string(),
});
export type AudioSourceType = z.infer<typeof AudioSourceSchema>;

const YouTubeSourceSchema = z.object({
  type: z.literal("NEW_YOUTUBE_SOURCE"),
  videoId: z.string(),
  title: z.string(),
  thumbnail: z.string().url().optional(),
  addedAt: z.number(),
  addedBy: z.string(),
});
export type YouTubeSourceType = z.infer<typeof YouTubeSourceSchema>;

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

const RoomEventSchema = z.object({
  type: z.literal("ROOM_EVENT"),
  event: z.discriminatedUnion("type", [
    ClientChangeMessageSchema,
    AudioSourceSchema,
    YouTubeSourceSchema,
  ]),
});

// HERE
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
