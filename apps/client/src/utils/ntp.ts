import { ClientActionEnum, epochNow } from "@beatsync/shared";
import { sendWSRequest } from "./ws";

export interface NTPMeasurement {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  roundTripDelay: number;
  clockOffset: number;
}

export const _sendNTPRequest = (ws: WebSocket, currentRTT?: number) => {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error("Cannot send NTP request: WebSocket is not open");
  }

  const t0 = epochNow();
  sendWSRequest({
    ws,
    request: {
      type: ClientActionEnum.enum.NTP_REQUEST,
      t0,
      clientRTT: currentRTT,
    },
  });
};

/**
 * Estimate clock offset using min-RTT selection.
 *
 * Queuing delays can only ADD to RTT, never subtract. So the lowest-RTT
 * measurement is closest to the true propagation delay, and its offset
 * has the least asymmetric queuing contamination. This is what NTP's
 * clock filter algorithm does (RFC 5905 §10).
 */
export const calculateOffsetEstimate = (ntpMeasurements: NTPMeasurement[]) => {
  let minRTT = Infinity;
  let bestOffset = 0;
  for (const m of ntpMeasurements) {
    if (m.roundTripDelay < minRTT) {
      minRTT = m.roundTripDelay;
      bestOffset = m.clockOffset;
    }
  }

  // Average round trip from all measurements (used for scheduling delay)
  const totalRoundTrip = ntpMeasurements.reduce((sum, m) => sum + m.roundTripDelay, 0);
  const averageRoundTrip = totalRoundTrip / ntpMeasurements.length;

  return { averageOffset: bestOffset, averageRoundTrip };
};

export const calculateWaitTimeMilliseconds = (targetServerTime: number, clockOffset: number): number => {
  const estimatedCurrentServerTime = epochNow() + clockOffset;
  return Math.max(0, targetServerTime - estimatedCurrentServerTime);
};
