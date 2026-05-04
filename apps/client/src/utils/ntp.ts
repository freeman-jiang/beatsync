import { ClientActionEnum, epochNow, NTP_CONSTANTS } from "@beatsync/shared";
import { sendWSRequest } from "./ws";

// ── Types ──────────────────────────────────────────────────────────

export interface NTPMeasurement {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  roundTripDelay: number;
  clockOffset: number;
}

// ── Probe pair sending ─────────────────────────────────────────────

let probeGroupCounter = 0;
let pendingFirstProbe: NTPMeasurement | null = null;
let pendingFirstProbeGroupId: number | null = null;
let pureCount = 0;
let impureCount = 0;

/** Reset probe state (call on connection reset) */
export const resetProbeState = () => {
  probeGroupCounter = 0;
  pendingFirstProbe = null;
  pendingFirstProbeGroupId = null;
  pureCount = 0;
  impureCount = 0;
};

/** Get probe pair stats for debugging */
export const getProbeStats = () => ({
  totalPairs: pureCount + impureCount,
  pureCount,
  impureCount,
  totalSent: probeGroupCounter,
});

/**
 * Send a coded probe pair (Huygens). Two NTP requests sent with a known
 * inter-departure gap. The client later validates that the server-side
 * inter-arrival gap matches, filtering out measurements corrupted by
 * queuing, TCP HOL blocking, or GC pauses.
 */
export const sendProbePair = (data: {
  ws: WebSocket;
  currentRTT: number | undefined;
  compensationMs: number | undefined;
  nudgeMs: number | undefined;
}) => {
  const { ws, currentRTT, compensationMs, nudgeMs } = data;
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error("Cannot send NTP request: WebSocket is not open");
  }

  const probeGroupId = probeGroupCounter++;

  // First probe — sent immediately
  sendWSRequest({
    ws,
    request: {
      type: ClientActionEnum.enum.NTP_REQUEST,
      t0: epochNow(),
      clientRTT: currentRTT,
      clientCompensationMs: compensationMs,
      clientNudgeMs: nudgeMs,
      probeGroupId,
      probeGroupIndex: 0,
    },
  });

  // Second probe — sent after PROBE_GAP_MS
  setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    sendWSRequest({
      ws,
      request: {
        type: ClientActionEnum.enum.NTP_REQUEST,
        t0: epochNow(),
        clientRTT: currentRTT,
        clientCompensationMs: compensationMs,
        clientNudgeMs: nudgeMs,
        probeGroupId,
        probeGroupIndex: 1,
      },
    });
  }, NTP_CONSTANTS.PROBE_GAP_MS);
};

// ── Probe pair collection ──────────────────────────────────────────

/**
 * Feed an individual probe response into the pair validator.
 *
 * Buffers the first probe (index 0). When the second probe (index 1)
 * arrives, validates gap purity and returns the best measurement
 * (lowest RTT) from the pair. Returns null if still waiting for the
 * second probe, the pair was impure, or the group ID didn't match.
 */
export const validateProbePair = (data: {
  measurement: NTPMeasurement;
  probeGroupId: number;
  probeGroupIndex: number;
}): NTPMeasurement | null => {
  const { measurement, probeGroupId, probeGroupIndex } = data;

  if (probeGroupIndex === 0) {
    pendingFirstProbe = measurement;
    pendingFirstProbeGroupId = probeGroupId;
    return null;
  }

  // probeGroupIndex === 1: try to complete the pair
  const first = pendingFirstProbe;
  const firstGroupId = pendingFirstProbeGroupId;

  if (!first || firstGroupId !== probeGroupId) {
    return null;
  }

  // Clear pending state
  pendingFirstProbe = null;
  pendingFirstProbeGroupId = null;

  // Validate gap purity: compare server inter-arrival gap against client inter-departure gap
  const clientGap = measurement.t0 - first.t0;
  const serverGap = measurement.t1 - first.t1;
  const gapDrift = Math.abs(serverGap - clientGap);
  const isPure = gapDrift <= NTP_CONSTANTS.PROBE_GAP_TOLERANCE_MS;

  if (isPure) {
    pureCount++;
  } else {
    impureCount++;
  }

  const total = pureCount + impureCount;
  const pureRate = total > 0 ? ((pureCount / total) * 100).toFixed(0) : "0";

  if (!isPure) {
    console.log(
      `[CodedProbe] IMPURE #${probeGroupId} | clientGap=${clientGap.toFixed(1)}ms serverGap=${serverGap.toFixed(1)}ms drift=${gapDrift.toFixed(1)}ms | pure: ${pureCount}/${total} (${pureRate}%) | sent: ${probeGroupCounter}`
    );
    return null;
  }

  const best = first.roundTripDelay <= measurement.roundTripDelay ? first : measurement;

  console.log(
    `[CodedProbe] PURE #${probeGroupId} | clientGap=${clientGap.toFixed(1)}ms serverGap=${serverGap.toFixed(1)}ms drift=${gapDrift.toFixed(1)}ms | bestRTT=${best.roundTripDelay.toFixed(1)}ms offset=${best.clockOffset.toFixed(1)}ms | pure: ${pureCount}/${total} (${pureRate}%) | sent: ${probeGroupCounter}`
  );

  return best;
};

// ── Offset estimation ──────────────────────────────────────────────

/**
 * Remove RTT outliers using the Interquartile Range (IQR) method.
 * Measurements with RTT > Q3 + 1.5*IQR are discarded as network spikes.
 * Returns at least 1 measurement (the min-RTT sample) even if all are "outliers".
 */
export const filterOutliersByIQR = (measurements: NTPMeasurement[]): NTPMeasurement[] => {
  if (measurements.length < 4) return measurements;

  const sorted = [...measurements].sort((a, b) => a.roundTripDelay - b.roundTripDelay);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index].roundTripDelay;
  const q3 = sorted[q3Index].roundTripDelay;
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;

  const filtered = measurements.filter((m) => m.roundTripDelay <= upperFence);
  // Always keep at least the min-RTT sample
  return filtered.length > 0 ? filtered : [sorted[0]];
};

/**
 * Estimate clock offset using IQR outlier rejection + bottom-quartile
 * cluster averaging.
 *
 * Two-stage pipeline:
 * 1. **IQR filter**: Discard measurements with RTT > Q3 + 1.5×IQR
 *    (network spikes, GC pauses, TCP retransmits).
 * 2. **Cluster average**: Sort remaining by RTT, take the bottom 25%
 *    (min 2 samples), and average their offsets. Averaging the
 *    lowest-RTT cluster reduces single-sample noise while still
 *    exploiting the fact that queuing only adds to RTT (RFC 5905 §10).
 *
 * Compared to pure min-RTT selection this reduces offset variance by
 * ~2–3× (σ/√k vs σ for k cluster members) while remaining robust to
 * asymmetric path delays.
 */
export const calculateOffsetEstimate = (measurements: NTPMeasurement[]) => {
  if (measurements.length === 0) {
    return { averageOffset: 0, averageRoundTrip: 0 };
  }

  // Stage 1: IQR outlier rejection
  const clean = filterOutliersByIQR(measurements);

  // Stage 2: Bottom-quartile cluster average
  const sorted = [...clean].sort((a, b) => a.roundTripDelay - b.roundTripDelay);
  const clusterSize = Math.max(2, Math.ceil(sorted.length * 0.25));
  const cluster = sorted.slice(0, Math.min(clusterSize, sorted.length));

  let offsetSum = 0;
  for (const m of cluster) {
    offsetSum += m.clockOffset;
  }
  const averageOffset = offsetSum / cluster.length;

  // Average RTT is computed over the clean (non-outlier) set
  const totalRoundTrip = clean.reduce((sum, m) => sum + m.roundTripDelay, 0);
  const averageRoundTrip = totalRoundTrip / clean.length;

  return { averageOffset, averageRoundTrip };
};

export const calculateWaitTimeMilliseconds = (targetServerTime: number, clockOffset: number): number => {
  const estimatedCurrentServerTime = epochNow() + clockOffset;
  return Math.max(0, targetServerTime - estimatedCurrentServerTime);
};
