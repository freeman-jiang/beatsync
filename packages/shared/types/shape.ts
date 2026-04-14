import { z } from "zod";
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
});
export type ShapeType = z.infer<typeof ShapeSchema>;

// Mirrors the room-level RoomPlaybackState but scoped to a single shape
export const ShapePlaybackStateSchema = z.object({
  type: z.enum(["playing", "paused"]),
  audioSource: z.string(), // URL of the currently active source, "" when none
  serverTimeToExecute: z.number(), // epoch ms of the scheduled action
  trackPositionSeconds: z.number(), // track position at the time of the action
});
export type ShapePlaybackStateType = z.infer<typeof ShapePlaybackStateSchema>;

export const INITIAL_SHAPE_PLAYBACK_STATE: ShapePlaybackStateType = {
  type: "paused",
  audioSource: "",
  serverTimeToExecute: 0,
  trackPositionSeconds: 0,
};

// Full shape state as broadcast to clients (shape geometry + playlist + playback)
export const ShapeStateSchema = z.object({
  shape: ShapeSchema,
  audioSources: z.array(AudioSourceSchema),
  playbackState: ShapePlaybackStateSchema,
});
export type ShapeStateType = z.infer<typeof ShapeStateSchema>;
