import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

// Liveness reply to a server LIVENESS_PING. The actual bookkeeping (markClientSeen)
// happens centrally in handleMessage for every valid message, so there is
// nothing left to do here.
export const handleLivenessPong: HandlerFunction<ExtractWSRequestFrom["LIVENESS_PONG"]> = () => {
  /* noop */
};
