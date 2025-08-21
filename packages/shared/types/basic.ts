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
});
export type ChatMessageType = z.infer<typeof ChatMessageSchema>;
