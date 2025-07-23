// 1:1 Private WS Responses
import { z } from "zod";
import { ScheduledActionSchema } from "./WSBroadcast";

const NTPResponseMessageSchema = z.object({
  type: z.literal("NTP_RESPONSE"),
  t0: z.number(), // Client send timestamp (echoed back)
  t1: z.number(), // Server receive timestamp
  t2: z.number(), // Server send timestamp
});
export type NTPResponseMessageType = z.infer<typeof NTPResponseMessageSchema>;

const SetClientID = z.object({
  type: z.literal("SET_CLIENT_ID"),
  clientId: z.string(),
});

export const WSUnicastSchema = z.discriminatedUnion("type", [
  NTPResponseMessageSchema,
  SetClientID,
  ScheduledActionSchema,
]);
export type WSUnicastType = z.infer<typeof WSUnicastSchema>;
