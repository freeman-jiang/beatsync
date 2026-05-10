import { z } from "zod";
import { CHAT_CONSTANTS, LOW_PASS_CONSTANTS, MAP_CONSTANTS } from "../constants";
import { AudioSourceSchema, MapMetadataSchema, PositionSchema } from "./basic";
import { ShapeSchema } from "./shape";

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
  "SEARCH_MUSIC", // Search for music
  "STREAM_MUSIC", // Stream music
  "SET_GLOBAL_VOLUME", // Set global volume for all clients
  "SEND_CHAT_MESSAGE", // Send a chat message,
  "AUDIO_SOURCE_LOADED", // Audio source loaded in response to a LOAD_AUDIO_SOURCE request
  "REORDER_AUDIO_SOURCES", // Reorder audio sources in the room queue
  "SET_METRONOME", // Toggle metronome on/off for all clients
  "SET_LOW_PASS_FREQ", // Set low-pass filter cutoff frequency
  // Shape management
  "ADD_SHAPE", // Add a new map zone
  "UPDATE_SHAPE", // Update zone geometry
  "DELETE_SHAPE", // Remove a zone
  "CLEAR_SHAPES", // Remove all zones
  // Per-shape audio sources
  "ADD_SHAPE_AUDIO_SOURCE", // Add an audio source to a shape's playlist
  "REMOVE_SHAPE_AUDIO_SOURCES", // Remove audio sources from a shape's playlist
  "REORDER_SHAPE_PLAYLIST", // Set the playlist order for a shape
  // Per-shape behavior
  "SET_SHAPE_LOOP", // Toggle whether a shape's playlist loops
  "SET_SHAPE_GROUP", // Link/unlink a shape to a transport group (null = solo)
  "SET_SHAPE_AUDIBLE_RADIUS", // Override the default audible radius for a shape
  // Map metadata
  "SET_MAP_METADATA", // Update the room's default Leaflet center/zoom
  // Client presence
  "SET_GEO_POSITION", // Update client GPS lat/lng
  "SET_VISIBILITY", // Tab hidden/visible state
]);

export const NTPRequestPacketSchema = z.object({
  type: z.literal(ClientActionEnum.enum.NTP_REQUEST),
  t0: z.number(), // Client send timestamp
  t1: z.number().optional(), // Server receive timestamp (will be set by the server)
  clientRTT: z.number().optional(), // Client's current RTT estimate in ms
  clientCompensationMs: z.number().optional(), // Total local compensation (outputLatency + nudge) the client subtracts from wait time
  clientNudgeMs: z.number().optional(), // Manual timing nudge set by the user (persisted per-client)
  probeGroupId: z.number(), // Coded probes (Huygens): shared ID for both probes in a pair
  probeGroupIndex: z.union([z.literal(0), z.literal(1)]), // Coded probes: 0 = first probe, 1 = second probe
});

export const PlayActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PLAY),
  // Map rooms scope playback to a particular shape's playlist. Audio rooms omit shapeId
  // and use the room-level singleton playback state.
  shapeId: z.string().optional(),
  trackTimeSeconds: z.number(),
  audioSource: z.string(),
});

export const PauseActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE),
  shapeId: z.string().optional(),
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

const SetAdminSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_ADMIN),
  clientId: z.string(), // The client to set admin status for
  isAdmin: z.boolean(), // The new admin status
});

export const PlaybackControlsPermissionsEnum = z.enum(["ADMIN_ONLY", "EVERYONE"]);
export type PlaybackControlsPermissionsType = z.infer<typeof PlaybackControlsPermissionsEnum>;

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

export const AudioSourceLoadedSchema = z.object({
  type: z.literal(ClientActionEnum.enum.AUDIO_SOURCE_LOADED),
  source: AudioSourceSchema,
  shapeId: z.string().optional(), // Which shape's loading gate to advance (map rooms only)
});

export const ReorderAudioSourcesSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REORDER_AUDIO_SOURCES),
  reorderedAudioSources: z.array(AudioSourceSchema).min(1),
});

export const SetMetronomeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_METRONOME),
  enabled: z.boolean(),
});

export const SetLowPassFreqSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_LOW_PASS_FREQ),
  freq: z.number().min(LOW_PASS_CONSTANTS.MIN_FREQ).max(LOW_PASS_CONSTANTS.MAX_FREQ),
});

// ── Shape management ────────────────────────────────────────────────

export const AddShapeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.ADD_SHAPE),
  shape: ShapeSchema,
});
export type AddShapeType = z.infer<typeof AddShapeSchema>;

export const UpdateShapeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.UPDATE_SHAPE),
  shapeId: z.string(),
  coordinates: z.unknown(), // Updated Leaflet geometry
});
export type UpdateShapeType = z.infer<typeof UpdateShapeSchema>;

export const DeleteShapeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.DELETE_SHAPE),
  shapeId: z.string(),
});
export type DeleteShapeType = z.infer<typeof DeleteShapeSchema>;

export const ClearShapesSchema = z.object({
  type: z.literal(ClientActionEnum.enum.CLEAR_SHAPES),
});
export type ClearShapesType = z.infer<typeof ClearShapesSchema>;

// ── Per-shape audio sources ─────────────────────────────────────────

export const AddShapeAudioSourceSchema = z.object({
  type: z.literal(ClientActionEnum.enum.ADD_SHAPE_AUDIO_SOURCE),
  shapeId: z.string(),
  source: AudioSourceSchema,
});
export type AddShapeAudioSourceType = z.infer<typeof AddShapeAudioSourceSchema>;

export const RemoveShapeAudioSourcesSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REMOVE_SHAPE_AUDIO_SOURCES),
  shapeId: z.string(),
  urls: z.array(z.string()).min(1),
});
export type RemoveShapeAudioSourcesType = z.infer<typeof RemoveShapeAudioSourcesSchema>;

export const ReorderShapePlaylistSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REORDER_SHAPE_PLAYLIST),
  shapeId: z.string(),
  reorderedAudioSources: z.array(AudioSourceSchema),
});
export type ReorderShapePlaylistType = z.infer<typeof ReorderShapePlaylistSchema>;

// ── Per-shape behavior ─────────────────────────────────────────────

export const SetShapeLoopSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SHAPE_LOOP),
  shapeId: z.string(),
  loop: z.boolean(),
});
export type SetShapeLoopType = z.infer<typeof SetShapeLoopSchema>;

export const SetShapeGroupSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SHAPE_GROUP),
  shapeId: z.string(),
  groupId: z.string().nullable(), // null = solo transport
});
export type SetShapeGroupType = z.infer<typeof SetShapeGroupSchema>;

export const SetShapeAudibleRadiusSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SHAPE_AUDIBLE_RADIUS),
  shapeId: z.string(),
  audibleRadiusMeters: z
    .number()
    .min(MAP_CONSTANTS.MIN_AUDIBLE_RADIUS_METERS)
    .max(MAP_CONSTANTS.MAX_AUDIBLE_RADIUS_METERS),
});
export type SetShapeAudibleRadiusType = z.infer<typeof SetShapeAudibleRadiusSchema>;

// ── Map metadata ───────────────────────────────────────────────────

export const SetMapMetadataSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_MAP_METADATA),
  metadata: MapMetadataSchema,
});
export type SetMapMetadataType = z.infer<typeof SetMapMetadataSchema>;

// ── Client presence ─────────────────────────────────────────────────

export const SetGeoPositionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_GEO_POSITION),
  lat: z.number(),
  lng: z.number(),
});
export type SetGeoPositionType = z.infer<typeof SetGeoPositionSchema>;

export const SetVisibilitySchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_VISIBILITY),
  isHidden: z.boolean(),
});
export type SetVisibilityType = z.infer<typeof SetVisibilitySchema>;

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
  SearchMusicSchema,
  StreamMusicSchema,
  SetGlobalVolumeSchema,
  SendChatMessageSchema,
  AudioSourceLoadedSchema,
  ReorderAudioSourcesSchema,
  SetMetronomeSchema,
  SetLowPassFreqSchema,
  // Shape management
  AddShapeSchema,
  UpdateShapeSchema,
  DeleteShapeSchema,
  ClearShapesSchema,
  AddShapeAudioSourceSchema,
  RemoveShapeAudioSourcesSchema,
  ReorderShapePlaylistSchema,
  // Per-shape behavior
  SetShapeLoopSchema,
  SetShapeGroupSchema,
  SetShapeAudibleRadiusSchema,
  // Map metadata
  SetMapMetadataSchema,
  // Client presence
  SetGeoPositionSchema,
  SetVisibilitySchema,
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
