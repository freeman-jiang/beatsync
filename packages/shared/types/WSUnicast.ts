// 1:1 Private WS Responses
import { z } from "zod";
import { ScheduledActionSchema } from "./WSBroadcast";
import { SearchResponseSchema } from "./provider";

const NTPResponseMessageSchema = z.object({
  type: z.literal("NTP_RESPONSE"),
  t0: z.number(), // Client send timestamp (echoed back)
  t1: z.number(), // Server receive timestamp
  t2: z.number(), // Server send timestamp
  clientRTT: z.number().optional(), // Client's current RTT estimate in ms
});
export type NTPResponseMessageType = z.infer<typeof NTPResponseMessageSchema>;

export const MusicSearchResponseSchema = z.object({
  type: z.literal("SEARCH_RESPONSE"),
  response: SearchResponseSchema,
});
export type MusicSearchResponseType = z.infer<typeof MusicSearchResponseSchema>;

export const WSUnicastSchema = z.discriminatedUnion("type", [
  NTPResponseMessageSchema,
  ScheduledActionSchema,
  MusicSearchResponseSchema,
]);
export type WSUnicastType = z.infer<typeof WSUnicastSchema>;
