import { z } from "zod";
import { WSBroadcastSchema } from "./WSBroadcast";
import { WSUnicastSchema } from "./WSUnicast";
export const WSResponseSchema = z.union([WSUnicastSchema, WSBroadcastSchema]);
export type WSResponseType = z.infer<typeof WSResponseSchema>;

// Mapped type to access response types by their type field (mirrors ExtractWSRequestFrom)
export type ExtractWSResponseFrom = {
  [K in WSResponseType["type"]]: Extract<WSResponseType, { type: K }>;
};
