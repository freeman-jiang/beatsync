import { epochNow, ExtractWSRequestFrom } from "@beatsync/shared";
import { sendUnicast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleNTPRequest: HandlerFunction<
  ExtractWSRequestFrom["NTP_REQUEST"]
> = async ({ ws, message }) => {
  if (!message.t1) {
    console.error("NTP request received without t1 timestamp");
    return;
  }

  // Update heartbeat and RTT for client
  const { room } = requireRoom(ws);
  room.processNTPRequestFrom(ws.data.clientId, message.clientRTT);

  sendUnicast({
    ws,
    message: {
      type: "NTP_RESPONSE",
      t0: message.t0, // Echo back the client's t0
      t1: message.t1, // Server receive time
      t2: epochNow(), // Server send time
    },
  });
};
