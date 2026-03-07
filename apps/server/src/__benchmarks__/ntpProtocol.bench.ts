/**
 * NTP Protocol Benchmark (real WebSocket, real server)
 *
 * Spins up a real Bun HTTP+WebSocket server, connects simulated clients
 * via actual WebSocket connections, runs the full NTP exchange protocol,
 * and measures offset estimation accuracy.
 *
 * Ground truth: all clocks are on the same machine, so true offset = 0.
 * Any non-zero offset estimate is error from the protocol + transport + event loop.
 *
 * Run: bun run src/__benchmarks__/ntpProtocol.bench.ts
 */

import { epochNow } from "@beatsync/shared";
import type { WSData } from "@/utils/websocket";
import { handleClose, handleMessage, handleOpen } from "@/routes/websocketHandlers";
import { handleWebSocketUpgrade } from "@/routes/websocket";
import { corsHeaders, errorResponse } from "@/utils/responses";
import { globalManager } from "@/managers/GlobalManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NTPMeasurement {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  roundTripDelay: number;
  clockOffset: number;
}

interface ClientResult {
  clientId: string;
  measurements: NTPMeasurement[];
  bestHalfOffset: number;
  minRttOffset: number;
  medianFilteredOffset: number;
}

// ---------------------------------------------------------------------------
// Start a real server on a random port
// ---------------------------------------------------------------------------

function startServer(): { server: ReturnType<typeof Bun.serve>; port: number } {
  const server = Bun.serve<WSData>({
    hostname: "127.0.0.1",
    port: 0, // random available port
    fetch(req, server) {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
      if (url.pathname === "/ws") {
        return handleWebSocketUpgrade(req, server) ?? errorResponse("Upgrade failed");
      }
      return errorResponse("Not found", 404);
    },
    websocket: {
      open(ws) {
        handleOpen(ws, server);
      },
      message(ws, message) {
        void handleMessage(ws, message, server);
      },
      close(ws) {
        handleClose(ws, server);
      },
    },
  });

  const port = server.port;
  if (!port) throw new Error("Server failed to bind to a port");
  return { server, port };
}

// ---------------------------------------------------------------------------
// Simulated client that runs NTP exchanges over real WebSocket
// ---------------------------------------------------------------------------

async function runClient(data: {
  port: number;
  clientId: string;
  roomId: string;
  numMeasurements: number;
  delayBetweenMs: number;
}): Promise<ClientResult> {
  const { port, clientId, roomId, numMeasurements, delayBetweenMs } = data;
  const measurements: NTPMeasurement[] = [];

  const wsUrl = `ws://127.0.0.1:${port}/ws?roomId=${roomId}&username=bench-${clientId}&clientId=${clientId}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let measurementIndex = 0;
    let currentT0 = 0;

    ws.onopen = () => {
      // Start first measurement
      sendProbe();
    };

    ws.onmessage = (event) => {
      const t3 = epochNow();
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;

      if (msg.type === "NTP_RESPONSE") {
        // Server sends: { type: "NTP_RESPONSE", t0: original_t0, t1: server_rx, t2: server_tx }
        const t0 = currentT0;
        const origT0 = msg.t0 as number;
        const t1 = msg.t1 as number;
        const t2 = msg.t2 as number;

        if (origT0 !== t0) {
          // Not our probe — skip (shouldn't happen in single-client test)
          return;
        }

        const rtt = t3 - t0 - (t2 - t1);
        const offset = (t1 - t0 + (t2 - t3)) / 2;

        measurements.push({ t0, t1, t2, t3, roundTripDelay: rtt, clockOffset: offset });
        measurementIndex++;

        if (measurementIndex < numMeasurements) {
          setTimeout(sendProbe, delayBetweenMs);
        } else {
          ws.close();
        }
      }
      // Ignore other message types (ROOM_EVENT, SCHEDULED_ACTION, etc.)
    };

    ws.onclose = () => {
      if (measurements.length === 0) {
        reject(new Error(`Client ${clientId}: no measurements collected`));
        return;
      }

      // Compute estimates using different algorithms
      const sorted = [...measurements].sort((a, b) => a.roundTripDelay - b.roundTripDelay);

      // Best-half average
      const bestHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
      const bestHalfOffset = bestHalf.reduce((s, m) => s + m.clockOffset, 0) / bestHalf.length;

      // Min-RTT selection
      const minRttOffset = sorted[0].clockOffset;

      // Median of RTT-filtered (best 25%)
      const cutoff = Math.max(Math.ceil(sorted.length * 0.25), 3);
      const filtered = sorted.slice(0, cutoff);
      const offsets = filtered.map((m) => m.clockOffset).sort((a, b) => a - b);
      const medianFilteredOffset = offsets[Math.floor(offsets.length / 2)];

      resolve({
        clientId,
        measurements,
        bestHalfOffset,
        minRttOffset,
        medianFilteredOffset,
      });
    };

    ws.onerror = () => {
      reject(new Error(`Client ${clientId} WebSocket error`));
    };

    function sendProbe() {
      currentT0 = epochNow();
      ws.send(
        JSON.stringify({
          type: "NTP_REQUEST",
          t0: currentT0,
        })
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (Math.abs(ms) < 0.01) return `${(ms * 1000).toFixed(1)}us`;
  return `${ms.toFixed(3)}ms`;
}

function stats(values: number[]): { mean: number; median: number; p95: number; max: number; stdDev: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
  return { mean, median, p95, max, stdDev: Math.sqrt(variance) };
}

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

const NUM_CLIENTS = 5;
const NUM_MEASUREMENTS = 40;
const PROBE_INTERVAL_MS = 30; // Match BeatSync's INITIAL_INTERVAL_MS
const ROOM_ID = "bench-room";

async function main() {
  console.log("Starting NTP Protocol Benchmark (real WebSocket)...\n");

  const { server, port } = startServer();
  console.log(`Server listening on port ${port}`);

  try {
    // Run clients in parallel (like real BeatSync usage)
    const clientPromises = Array.from({ length: NUM_CLIENTS }, (_, i) =>
      runClient({
        port,
        clientId: `client-${i + 1}`,
        roomId: ROOM_ID,
        numMeasurements: NUM_MEASUREMENTS,
        delayBetweenMs: PROBE_INTERVAL_MS,
      })
    );

    const results = await Promise.all(clientPromises);

    // Print per-client results
    console.log("\n" + "=".repeat(90));
    console.log("NTP Protocol Benchmark Results");
    console.log(`${NUM_CLIENTS} clients, ${NUM_MEASUREMENTS} measurements each, ${PROBE_INTERVAL_MS}ms interval`);
    console.log("Ground truth offset = 0 (localhost). All values are absolute error.");
    console.log("=".repeat(90));

    console.log(
      "\n  Client".padEnd(20) +
        "Best-half".padStart(12) +
        "Min-RTT".padStart(12) +
        "Median-filt".padStart(12) +
        "Avg RTT".padStart(12) +
        "Min RTT".padStart(12)
    );

    for (const r of results) {
      const rtts = r.measurements.map((m) => m.roundTripDelay);
      const avgRtt = rtts.reduce((s, v) => s + v, 0) / rtts.length;
      const minRtt = Math.min(...rtts);

      console.log(
        `  ${r.clientId}`.padEnd(20) +
          formatMs(Math.abs(r.bestHalfOffset)).padStart(12) +
          formatMs(Math.abs(r.minRttOffset)).padStart(12) +
          formatMs(Math.abs(r.medianFilteredOffset)).padStart(12) +
          formatMs(avgRtt).padStart(12) +
          formatMs(minRtt).padStart(12)
      );
    }

    // Aggregate statistics across clients
    console.log("\n--- Aggregate (across all clients) ---");

    const algoNames = ["Best-half", "Min-RTT", "Median-filtered"] as const;
    const algoGetters = [
      (r: ClientResult) => Math.abs(r.bestHalfOffset),
      (r: ClientResult) => Math.abs(r.minRttOffset),
      (r: ClientResult) => Math.abs(r.medianFilteredOffset),
    ];

    console.log("  Algorithm".padEnd(25) + "Mean".padStart(10) + "Median".padStart(10) + "Max".padStart(10));

    for (let i = 0; i < algoNames.length; i++) {
      const errors = results.map(algoGetters[i]);
      const s = stats(errors);
      console.log(
        `  ${algoNames[i]}`.padEnd(25) +
          formatMs(s.mean).padStart(10) +
          formatMs(s.median).padStart(10) +
          formatMs(s.max).padStart(10)
      );
    }

    // Inter-device sync (pairwise offset differences)
    console.log("\n--- Inter-device sync (pairwise offset differences, best-half) ---");
    const pairwiseErrors: number[] = [];
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const diff = Math.abs(results[i].bestHalfOffset - results[j].bestHalfOffset);
        pairwiseErrors.push(diff);
      }
    }

    if (pairwiseErrors.length > 0) {
      const ps = stats(pairwiseErrors);
      console.log(`  Pairs: ${pairwiseErrors.length}`);
      console.log(`  Mean inter-device error: ${formatMs(ps.mean)}`);
      console.log(`  Max inter-device error:  ${formatMs(ps.max)}`);
      console.log(`  Median:                  ${formatMs(ps.median)}`);
    }

    // RTT distribution
    console.log("\n--- RTT distribution (all clients combined) ---");
    const allRtts = results.flatMap((r) => r.measurements.map((m) => m.roundTripDelay));
    const rttStats = stats(allRtts);
    console.log(
      `  Mean: ${formatMs(rttStats.mean)}  Median: ${formatMs(rttStats.median)}  P95: ${formatMs(rttStats.p95)}  Max: ${formatMs(rttStats.max)}`
    );

    console.log("\n" + "=".repeat(90));
  } finally {
    // Cleanup
    void server.stop();
    // Clean up rooms
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  }
}

const run = async () => {
  await main().finally(() => process.exit(0));
};
run().catch(console.error);
