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

// YouTube download response
const YouTubeDownloadResponseSchema = z.object({
  type: z.literal("YOUTUBE_DOWNLOAD_RESPONSE"),
  success: z.boolean(),
  jobId: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type YouTubeDownloadResponseType = z.infer<typeof YouTubeDownloadResponseSchema>;

export const WSUnicastSchema = z.discriminatedUnion("type", [
  NTPResponseMessageSchema,
  ScheduledActionSchema,
  YouTubeDownloadResponseSchema,
]);
export type WSUnicastType = z.infer<typeof WSUnicastSchema>;
