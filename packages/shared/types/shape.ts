// Map-room shape geometry. A shape's audio behavior is NOT stored here — instead,
// every shape owns a playlist context whose id == shape.id, managed by the unified
// per-context playlist primitive (see playlist.ts). This separates "where is the
// zone on the map?" (shape) from "what does it play and what's the playback state?"
// (playlist).

import { z } from "zod";
import { MAP_CONSTANTS } from "../constants";

// Leaflet geometry — kept as unknown because the structure varies by draw type:
//   polygon: number[][][] (outer ring + holes) or LatLng[][]
//   circle:  { center: [lat, lng], radius: meters }
//   rectangle: same as polygon
export const ShapeCoordinatesSchema = z.unknown();

export const ShapeSchema = z.object({
  id: z.string(),
  type: z.string(), // 'polygon', 'circle', 'rectangle', 'circlemarker'
  coordinates: ShapeCoordinatesSchema,
  createdBy: z.string(), // clientId of creator
  createdAt: z.number(), // epoch ms

  // Shapes whose groupId matches play/pause together. null = solo transport.
  // (Note: enforced in the future; landed as a placeholder field for now.)
  groupId: z.string().nullable().default(null),

  // Distance in meters past the shape's edge over which audio fades from full
  // to silent. Inside the shape itself: full volume. Outside: linear fade from
  // 1 → 0 across this many meters of distance to the nearest edge. Curators
  // tune this per shape via SET_SHAPE_FALLOFF.
  falloffMeters: z
    .number()
    .min(MAP_CONSTANTS.MIN_FALLOFF_METERS)
    .max(MAP_CONSTANTS.MAX_FALLOFF_METERS)
    .default(MAP_CONSTANTS.DEFAULT_FALLOFF_METERS),
});
export type ShapeType = z.infer<typeof ShapeSchema>;
