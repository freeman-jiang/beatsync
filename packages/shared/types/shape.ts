import { z } from "zod";
import { MAP_CONSTANTS } from "../constants";
import { AudioSourceSchema } from "./basic";

// Leaflet geometry — kept as unknown because the structure varies by draw type
// (polygon: LatLng[][], circle: {center, radius}, circlemarker: {center, radius})
export const ShapeCoordinatesSchema = z.unknown();

export const ShapeSchema = z.object({
  id: z.string(),
  type: z.string(), // 'polygon', 'circle', 'rectangle', 'circlemarker'
  coordinates: ShapeCoordinatesSchema,
  createdBy: z.string(), // clientId of creator
  createdAt: z.number(), // epoch ms

  // Map-room behavior (all optional with sane defaults so existing audio rooms ignore them)
  loop: z.boolean().default(true),
  // Shapes sharing a non-null groupId play/pause together. null = solo transport.
  groupId: z.string().nullable().default(null),
  audibleRadiusMeters: z
    .number()
    .min(MAP_CONSTANTS.MIN_AUDIBLE_RADIUS_METERS)
    .max(MAP_CONSTANTS.MAX_AUDIBLE_RADIUS_METERS)
    .default(MAP_CONSTANTS.DEFAULT_AUDIBLE_RADIUS_METERS),
});
export type ShapeType = z.infer<typeof ShapeSchema>;

// Mirrors the room-level RoomPlaybackState but scoped to a single shape.
// Carries the entire information needed for a late-joining client to seek into the loop.
export const ShapePlaybackStateSchema = z.object({
  type: z.enum(["playing", "paused"]),
  audioSource: z.string(), // URL of the currently active source, "" when none
  trackIndex: z.number().int().nonnegative(), // index into the shape's playlist
  serverTimeToExecute: z.number(), // epoch ms of the scheduled action
  trackPositionSeconds: z.number(), // track position at the time of the action
});
export type ShapePlaybackStateType = z.infer<typeof ShapePlaybackStateSchema>;

export const INITIAL_SHAPE_PLAYBACK_STATE: ShapePlaybackStateType = {
  type: "paused",
  audioSource: "",
  trackIndex: 0,
  serverTimeToExecute: 0,
  trackPositionSeconds: 0,
};

// Full shape state as broadcast to clients (geometry + playlist + playback).
// The playlist is an ordered array of audio sources; trackIndex into it identifies
// the currently active source.
export const ShapeStateSchema = z.object({
  shape: ShapeSchema,
  playlist: z.array(AudioSourceSchema),
  playbackState: ShapePlaybackStateSchema,
});
export type ShapeStateType = z.infer<typeof ShapeStateSchema>;
