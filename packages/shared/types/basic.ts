import { z } from "zod";
import { CHAT_CONSTANTS } from "../constants";

export const GRID = {
  SIZE: 100,
  ORIGIN_X: 50,
  ORIGIN_Y: 50,
  CLIENT_RADIUS: 25,
} as const;

export const PositionSchema = z.object({
  x: z.number().min(0).max(GRID.SIZE),
  y: z.number().min(0).max(GRID.SIZE),
});
export type PositionType = z.infer<typeof PositionSchema>;

// Real-world geographic coordinate. Used by map rooms for client presence and
// shape geometry (Leaflet stores latlng pairs, which we mirror here for typing).
export const GeoPositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPositionType = z.infer<typeof GeoPositionSchema>;

// Discriminator for which experience a room offers. Set by the first connecting
// client (WS upgrade query param) and immutable for the room's lifetime.
export const RoomTypeEnum = z.enum(["audio", "map"]);
export type RoomTypeValue = z.infer<typeof RoomTypeEnum>;

// Curator-controlled default Leaflet view for a map room.
export const MapMetadataSchema = z.object({
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number().min(0).max(22),
});
export type MapMetadataType = z.infer<typeof MapMetadataSchema>;

export const AudioSourceSchema = z.object({
  url: z.string(),
});
export type AudioSourceType = z.infer<typeof AudioSourceSchema>;

export const ChatMessageSchema = z.object({
  id: z.number(),
  clientId: z.string(),
  username: z.string(),
  text: z.string().max(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH),
  timestamp: z.number(),
  countryCode: z.string().optional(),
  isCreator: z.boolean().default(false),
});
export type ChatMessageType = z.infer<typeof ChatMessageSchema>;
