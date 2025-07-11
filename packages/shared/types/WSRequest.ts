import { z } from "zod";
import { PositionSchema } from "./basic";
export const ClientSchema = z.object({
  username: z.string(),
  clientId: z.string(),
});

export const ClientActionEnum = z.enum([
  "PLAY",
  "PAUSE",
  "CLIENT_CHANGE",
  "NTP_REQUEST",
  "START_SPATIAL_AUDIO",
  "STOP_SPATIAL_AUDIO",
  "REUPLOAD_AUDIO",
  "REORDER_CLIENT",
  "SET_LISTENING_SOURCE",
  "MOVE_CLIENT",
  "PLAY_YOUTUBE",
  "PAUSE_YOUTUBE",
  "SEEK_YOUTUBE",
]);

export const NTPRequestPacketSchema = z.object({
  type: z.literal(ClientActionEnum.enum.NTP_REQUEST),
  t0: z.number(), // Client send timestamp
});

export const PlayActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PLAY),
  trackTimeSeconds: z.number(),
  audioId: z.string(),
});

export const PauseActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE),
});

const StartSpatialAudioSchema = z.object({
  type: z.literal(ClientActionEnum.enum.START_SPATIAL_AUDIO),
});

const StopSpatialAudioSchema = z.object({
  type: z.literal(ClientActionEnum.enum.STOP_SPATIAL_AUDIO),
});

const ReuploadAudioSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REUPLOAD_AUDIO),
  audioId: z.string(),
  audioName: z.string(),
});

const ReorderClientSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REORDER_CLIENT),
  clientId: z.string(),
});

const SetListeningSourceSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_LISTENING_SOURCE),
  x: z.number(),
  y: z.number(),
});

const MoveClientSchema = z.object({
  type: z.literal(ClientActionEnum.enum.MOVE_CLIENT),
  clientId: z.string(),
  position: PositionSchema,
});
export type MoveClientType = z.infer<typeof MoveClientSchema>;

const PlayYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PLAY_YOUTUBE),
  videoId: z.string(),
  timeSeconds: z.number(),
});

const PauseYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE_YOUTUBE),
  videoId: z.string(),
});

const SeekYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SEEK_YOUTUBE),
  videoId: z.string(),
  timeSeconds: z.number(),
});

export { PlayYouTubeActionSchema, PauseYouTubeActionSchema, SeekYouTubeActionSchema };

export const WSRequestSchema = z.discriminatedUnion("type", [
  PlayActionSchema,
  PauseActionSchema,
  NTPRequestPacketSchema,
  StartSpatialAudioSchema,
  StopSpatialAudioSchema,
  ReuploadAudioSchema,
  ReorderClientSchema,
  SetListeningSourceSchema,
  MoveClientSchema,
  PlayYouTubeActionSchema,
  PauseYouTubeActionSchema,
  SeekYouTubeActionSchema,
]);
export type WSRequestType = z.infer<typeof WSRequestSchema>;
export type PlayActionType = z.infer<typeof PlayActionSchema>;
export type PauseActionType = z.infer<typeof PauseActionSchema>;
export type ReuploadAudioType = z.infer<typeof ReuploadAudioSchema>;
export type ReorderClientType = z.infer<typeof ReorderClientSchema>;
export type SetListeningSourceType = z.infer<typeof SetListeningSourceSchema>;
export type PlayYouTubeActionType = z.infer<typeof PlayYouTubeActionSchema>;
export type PauseYouTubeActionType = z.infer<typeof PauseYouTubeActionSchema>;
export type SeekYouTubeActionType = z.infer<typeof SeekYouTubeActionSchema>;
