import { ClientActionEnum, epochNow } from "@beatsync/shared";
import { sendWSRequest } from "./ws";
import { MAX_NTP_MEASUREMENTS } from "@/store/global";

export interface NTPMeasurement {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  roundTripDelay: number;
  clockOffset: number;
}

export const _sendNTPRequest = (ws: WebSocket) => {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error("Cannot send NTP request: WebSocket is not open");
  }

  const t0 = epochNow();
  sendWSRequest({
    ws,
    request: {
      type: ClientActionEnum.enum.NTP_REQUEST,
      t0,
    },
  });
};

export const calculateOffsetEstimate = (ntpMeasurements: NTPMeasurement[]) => {
  // We take the best half of the measurements
  // We take the half of the requests with the smallest round-trip delays because higher delays are probably due to random network conditions
  const sortedMeasurements = [...ntpMeasurements].sort(
    (a, b) => a.roundTripDelay - b.roundTripDelay
  );
  const bestMeasurements = sortedMeasurements.slice(
    0,
    Math.ceil(sortedMeasurements.length / 2)
  );

  // Calculate average round trip from all measurements
  const totalRoundTrip = ntpMeasurements.reduce(
    (sum, m) => sum + m.roundTripDelay,
    0
  );
  const averageRoundTrip = totalRoundTrip / ntpMeasurements.length;

  // But only use the best measurements for offset calculation
  const totalOffset = bestMeasurements.reduce(
    (sum, m) => sum + m.clockOffset,
    0
  );
  const averageOffset = totalOffset / bestMeasurements.length;

  const result = { averageOffset, averageRoundTrip };

  if (ntpMeasurements.length === MAX_NTP_MEASUREMENTS) {
    console.log("New clock offset calculated:", result);
  }

  return result;
};

export const calculateWaitTimeMilliseconds = (
  targetServerTime: number,
  clockOffset: number
): number => {
  const estimatedCurrentServerTime = epochNow() + clockOffset;
  return Math.max(0, targetServerTime - estimatedCurrentServerTime);
};
