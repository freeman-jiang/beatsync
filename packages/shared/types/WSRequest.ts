import { z } from "zod";
import { PositionSchema, YouTubeSourceSchema } from "./basic";
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
  "REORDER_CLIENT",
  "SET_LISTENING_SOURCE",
  "MOVE_CLIENT",
  "SYNC", // Client joins late, requests sync
  "PLAY_YOUTUBE",
  "PAUSE_YOUTUBE",
  "SEEK_YOUTUBE",
  "SET_MODE",
  "ADD_YOUTUBE_SOURCE",
  "REMOVE_YOUTUBE_SOURCE",
  "SET_SELECTED_AUDIO",
  "SET_SELECTED_YOUTUBE",
]);

export const NTPRequestPacketSchema = z.object({
  type: z.literal(ClientActionEnum.enum.NTP_REQUEST),
  t0: z.number(), // Client send timestamp
});

export const PlayActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PLAY),
  trackTimeSeconds: z.number(),
  audioSource: z.string(),
});

export const PauseActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE),
  audioSource: z.string(),
  trackTimeSeconds: z.number(),
});

const StartSpatialAudioSchema = z.object({
  type: z.literal(ClientActionEnum.enum.START_SPATIAL_AUDIO),
});

const StopSpatialAudioSchema = z.object({
  type: z.literal(ClientActionEnum.enum.STOP_SPATIAL_AUDIO),
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

const ClientRequestSyncSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SYNC),
});
export type ClientRequestSyncType = z.infer<typeof ClientRequestSyncSchema>;

// YouTube action schemas
export const PlayYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PLAY_YOUTUBE),
  trackTimeSeconds: z.number(),
  videoId: z.string(),
});

export const PauseYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE_YOUTUBE),
  videoId: z.string(),
  trackTimeSeconds: z.number(),
});

export const SeekYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SEEK_YOUTUBE),
  videoId: z.string(),
  trackTimeSeconds: z.number(),
});

const SetModeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_MODE),
  mode: z.enum(["library", "youtube"]),
});

const AddYouTubeSourceActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.ADD_YOUTUBE_SOURCE),
  source: YouTubeSourceSchema,
});

const RemoveYouTubeSourceActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE),
  videoId: z.string(),
});

const SetSelectedAudioActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SELECTED_AUDIO),
  audioUrl: z.string(),
});

const SetSelectedYouTubeActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SELECTED_YOUTUBE),
  videoId: z.string(),
});

export const WSRequestSchema = z.discriminatedUnion("type", [
  PlayActionSchema,
  PauseActionSchema,
  NTPRequestPacketSchema,
  StartSpatialAudioSchema,
  StopSpatialAudioSchema,
  ReorderClientSchema,
  SetListeningSourceSchema,
  MoveClientSchema,
  ClientRequestSyncSchema,
  PlayYouTubeActionSchema,
  PauseYouTubeActionSchema,
  SeekYouTubeActionSchema,
  SetModeActionSchema,
  AddYouTubeSourceActionSchema,
  RemoveYouTubeSourceActionSchema,
  SetSelectedAudioActionSchema,
  SetSelectedYouTubeActionSchema,
]);
export type WSRequestType = z.infer<typeof WSRequestSchema>;
export type PlayActionType = z.infer<typeof PlayActionSchema>;
export type PauseActionType = z.infer<typeof PauseActionSchema>;
export type ReorderClientType = z.infer<typeof ReorderClientSchema>;
export type SetListeningSourceType = z.infer<typeof SetListeningSourceSchema>;

// Export YouTube action types
export type PlayYouTubeActionType = z.infer<typeof PlayYouTubeActionSchema>;
export type PauseYouTubeActionType = z.infer<typeof PauseYouTubeActionSchema>;
export type SeekYouTubeActionType = z.infer<typeof SeekYouTubeActionSchema>;
export type SetModeActionType = z.infer<typeof SetModeActionSchema>;
export type AddYouTubeSourceActionType = z.infer<typeof AddYouTubeSourceActionSchema>;
export type RemoveYouTubeSourceActionType = z.infer<typeof RemoveYouTubeSourceActionSchema>;
export type SetSelectedAudioActionType = z.infer<typeof SetSelectedAudioActionSchema>;
export type SetSelectedYouTubeActionType = z.infer<typeof SetSelectedYouTubeActionSchema>;
