import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { epochNow } from "@beatsync/shared";
import { sendUnicast } from "@/utils/responses";
import { requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleNTPRequest: HandlerFunction<ExtractWSRequestFrom["NTP_REQUEST"]> = ({ ws, message }) => {
  if (!message.t1) {
    console.error("NTP request received without t1 timestamp");
    return;
  }

  // Update heartbeat and RTT for client
  const { room } = requireRoom(ws);
  room.processNTPRequestFrom({
    clientId: ws.data.clientId,
    clientRTT: message.clientRTT,
    clientCompensationMs: message.clientCompensationMs,
  });

  sendUnicast({
    ws,
    message: {
      type: "NTP_RESPONSE",
      t0: message.t0, // Echo back the client's t0
      t1: message.t1, // Server receive time
      t2: epochNow(), // Server send time
      probeGroupId: message.probeGroupId, // Coded probes: echo back
      probeGroupIndex: message.probeGroupIndex, // Coded probes: echo back
    },
  });
};
