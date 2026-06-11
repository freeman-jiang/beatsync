// 1:1 Private WS Responses
import { z } from "zod";
import { ScheduledActionSchema, ServerActionEnum } from "./WSBroadcast";
import { SearchResponseSchema } from "./provider";

const NTPResponseMessageSchema = z.object({
  type: z.literal(ServerActionEnum.enum.NTP_RESPONSE),
  t0: z.number(), // Client send timestamp (echoed back)
  t1: z.number(), // Server receive timestamp
  t2: z.number(), // Server send timestamp
  clientRTT: z.number().optional(), // Client's current RTT estimate in ms
  probeGroupId: z.number(), // Coded probes (Huygens): echoed from request
  probeGroupIndex: z.union([z.literal(0), z.literal(1)]), // Coded probes: echoed from request
});
export type NTPResponseMessageType = z.infer<typeof NTPResponseMessageSchema>;

export const MusicSearchResponseSchema = z.object({
  type: z.literal(ServerActionEnum.enum.SEARCH_RESPONSE),
  response: SearchResponseSchema,
});
export type MusicSearchResponseType = z.infer<typeof MusicSearchResponseSchema>;

// Liveness probe sent to clients that have been silent (e.g. backgrounded tabs
// with throttled timers). Clients reply with a LIVENESS_PONG request.
const LivenessPingMessageSchema = z.object({
  type: z.literal(ServerActionEnum.enum.LIVENESS_PING),
});

export const WSUnicastSchema = z.discriminatedUnion("type", [
  NTPResponseMessageSchema,
  ScheduledActionSchema,
  MusicSearchResponseSchema,
  LivenessPingMessageSchema,
]);
export type WSUnicastType = z.infer<typeof WSUnicastSchema>;
