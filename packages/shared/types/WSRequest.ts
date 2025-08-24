import { z } from "zod";
import { CHAT_CONSTANTS } from "../constants";
import { PositionSchema } from "./basic";

// ROOM EVENTS
export const LocationSchema = z.object({
  flagEmoji: z.string(),
  flagSvgURL: z.string(),
  city: z.string(),
  country: z.string(),
  region: z.string(),
  countryCode: z.string(),
});

export const ClientActionEnum = z.enum([
  "PLAY",
  "PAUSE",
  "NTP_REQUEST",
  "START_SPATIAL_AUDIO",
  "STOP_SPATIAL_AUDIO",
  "REORDER_CLIENT",
  "SET_LISTENING_SOURCE",
  "MOVE_CLIENT",
  "SYNC", // Client joins late, requests sync
  "SET_ADMIN", // Set admin status
  "SET_PLAYBACK_CONTROLS", // Set playback controls
  "SEND_IP", // Send IP to server
  "LOAD_DEFAULT_TRACKS", // Load default tracks into empty queue
  "DELETE_AUDIO_SOURCES", // Delete audio sources from the room queue (non-default only)
  "REORDER_AUDIO_SOURCES", // Reorder audio sources in the room queue
  "SEARCH_MUSIC", // Search for music
  "STREAM_MUSIC", // Stream music
  "SET_GLOBAL_VOLUME", // Set global volume for all clients
  "SEND_CHAT_MESSAGE", // Send a chat message
]);

export const NTPRequestPacketSchema = z.object({
  type: z.literal(ClientActionEnum.enum.NTP_REQUEST),
  t0: z.number(), // Client send timestamp
  t1: z.number().optional(), // Server receive timestamp (will be set by the server)
  clientRTT: z.number().optional(), // Client's current RTT estimate in ms
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

const LoadDefaultTracksSchema = z.object({
  type: z.literal(ClientActionEnum.enum.LOAD_DEFAULT_TRACKS),
});

const DeleteAudioSourcesSchema = z.object({
  type: z.literal(ClientActionEnum.enum.DELETE_AUDIO_SOURCES),
  urls: z.array(z.string()).min(1),
});

const ReorderAudioSourcesSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REORDER_AUDIO_SOURCES),
  urls: z.array(z.string()).min(1), // Array of URLs in the new order  
});

const SetAdminSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_ADMIN),
  clientId: z.string(), // The client to set admin status for
  isAdmin: z.boolean(), // The new admin status
});

export const PlaybackControlsPermissionsEnum = z.enum([
  "ADMIN_ONLY",
  "EVERYONE",
]);
export type PlaybackControlsPermissionsType = z.infer<
  typeof PlaybackControlsPermissionsEnum
>;

export const SetPlaybackControlsSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_PLAYBACK_CONTROLS),
  permissions: PlaybackControlsPermissionsEnum,
});

export const SendLocationSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SEND_IP),
  location: LocationSchema,
});

export const SearchMusicSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SEARCH_MUSIC),
  query: z.string(),
  offset: z.number().min(0).default(0).optional(),
});

export const StreamMusicSchema = z.object({
  type: z.literal(ClientActionEnum.enum.STREAM_MUSIC),
  trackId: z.number(),
  trackName: z.string().optional(),
});

export const SetGlobalVolumeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_GLOBAL_VOLUME),
  volume: z.number().min(0).max(1), // 0-1 range
});

export const SendChatMessageSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SEND_CHAT_MESSAGE),
  text: z.string().max(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH),
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
  SetAdminSchema,
  SetPlaybackControlsSchema,
  SendLocationSchema,
  LoadDefaultTracksSchema,
  DeleteAudioSourcesSchema,
  ReorderAudioSourcesSchema,
  SearchMusicSchema,
  StreamMusicSchema,
  SetGlobalVolumeSchema,
  SendChatMessageSchema,
]);
export type WSRequestType = z.infer<typeof WSRequestSchema>;
export type PlayActionType = z.infer<typeof PlayActionSchema>;
export type PauseActionType = z.infer<typeof PauseActionSchema>;
export type ReorderClientType = z.infer<typeof ReorderClientSchema>;
export type SetListeningSourceType = z.infer<typeof SetListeningSourceSchema>;
export type ReorderAudioSourcesType = z.infer<typeof ReorderAudioSourcesSchema>;

// Mapped type to access request types by their type field
export type ExtractWSRequestFrom = {
  [K in WSRequestType["type"]]: Extract<WSRequestType, { type: K }>;
};
