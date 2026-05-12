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
  "SET_CONTEXT_LOOP", // Set the loop flag for a playlist context
  "ADD_TRACK_TO_CONTEXT", // Append a track to a specific playlist context
  "REMOVE_TRACK_FROM_CONTEXT", // Remove a track from a specific playlist context
  // Map-room geometry actions. Audio behavior of a shape's playlist (tracks,
  // play/pause, loop) flows through the unified per-context actions with
  // contextId = shape.id — there are no shape-specific audio actions.
  "ADD_SHAPE",
  "UPDATE_SHAPE",
  "DELETE_SHAPE",
  "CLEAR_SHAPES",
  "SET_SHAPE_AUDIBLE_RADIUS",
  "SET_SHAPE_GROUP",
  "SET_MAP_METADATA",
  "SET_GEO_POSITION", // Client GPS update
  "SET_VISIBILITY", // Tab visibility (hidden tabs still receive sync)
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
  trackTimeSeconds: z.number(),
  audioSource: z.string(),
  /**
   * Which playback context (playlist) to operate on. Omitted = "main" — preserves
   * audio-room behavior. Future room types (e.g. map rooms) use per-shape contexts.
   */
  contextId: z.string().optional(),
});

export const PauseActionSchema = z.object({
  type: z.literal(ClientActionEnum.enum.PAUSE),
  audioSource: z.string(),
  trackTimeSeconds: z.number(),
  /** See PlayActionSchema.contextId. Omitted = "main". */
  contextId: z.string().optional(),
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
  /** Which playback context's load gate to advance. Omitted = "main". */
  contextId: z.string().optional(),
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

/**
 * Toggle the loop flag on a playlist context. When true, the current track
 * loops continuously until the user advances. Map zones default true; audio
 * rooms default false. Omitted contextId = "main".
 */
export const SetContextLoopSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_CONTEXT_LOOP),
  loop: z.boolean(),
  contextId: z.string().optional(),
});

/**
 * Append a track to a specific context's playlist. For audio rooms this is
 * equivalent to /upload/complete adding to the room queue; for map rooms it
 * adds to a specific shape's playlist. Omitted contextId = "main".
 */
export const AddTrackToContextSchema = z.object({
  type: z.literal(ClientActionEnum.enum.ADD_TRACK_TO_CONTEXT),
  source: AudioSourceSchema,
  contextId: z.string().optional(),
});
export type AddTrackToContextType = z.infer<typeof AddTrackToContextSchema>;

export const RemoveTrackFromContextSchema = z.object({
  type: z.literal(ClientActionEnum.enum.REMOVE_TRACK_FROM_CONTEXT),
  url: z.string(),
  contextId: z.string().optional(),
});
export type RemoveTrackFromContextType = z.infer<typeof RemoveTrackFromContextSchema>;

// ── Map-room geometry ──────────────────────────────────────────────
// Audio behavior (tracks, play/pause, loop) flows through the unified per-
// context actions with contextId = shape.id. The shape actions below only
// manage geometry + map-specific behavior (audible radius, transport group).

export const AddShapeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.ADD_SHAPE),
  shape: ShapeSchema,
});
export type AddShapeType = z.infer<typeof AddShapeSchema>;

export const UpdateShapeSchema = z.object({
  type: z.literal(ClientActionEnum.enum.UPDATE_SHAPE),
  shapeId: z.string(),
  coordinates: z.unknown(),
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

export const SetShapeAudibleRadiusSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SHAPE_AUDIBLE_RADIUS),
  shapeId: z.string(),
  audibleRadiusMeters: z
    .number()
    .min(MAP_CONSTANTS.MIN_AUDIBLE_RADIUS_METERS)
    .max(MAP_CONSTANTS.MAX_AUDIBLE_RADIUS_METERS),
});
export type SetShapeAudibleRadiusType = z.infer<typeof SetShapeAudibleRadiusSchema>;

export const SetShapeGroupSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_SHAPE_GROUP),
  shapeId: z.string(),
  groupId: z.string().nullable(),
});
export type SetShapeGroupType = z.infer<typeof SetShapeGroupSchema>;

export const SetMapMetadataSchema = z.object({
  type: z.literal(ClientActionEnum.enum.SET_MAP_METADATA),
  metadata: MapMetadataSchema,
});
export type SetMapMetadataType = z.infer<typeof SetMapMetadataSchema>;

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
  SetContextLoopSchema,
  AddTrackToContextSchema,
  RemoveTrackFromContextSchema,
  // Map-room geometry
  AddShapeSchema,
  UpdateShapeSchema,
  DeleteShapeSchema,
  ClearShapesSchema,
  SetShapeAudibleRadiusSchema,
  SetShapeGroupSchema,
  SetMapMetadataSchema,
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
