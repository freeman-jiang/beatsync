/**
 * Beatsync Load Test — Simulates concurrent WebSocket clients
 *
 * Mimics the real client flow:
 *   1. Connect to WS with roomId/username/clientId
 *   2. Receive initial state messages
 *   3. Run NTP sync probes (coded probe pairs, ~40 exchanges over ~2s)
 *   4. Respond to LOAD_AUDIO_SOURCE with AUDIO_SOURCE_LOADED
 *   5. Continue steady-state NTP pings every 2.5s
 *
 * Usage:
 *   bun run scripts/load-test.ts [options]
 *
 * Options:
 *   --clients <n>     Number of clients to simulate (default: 2500)
 *   --room <id>       Room ID to join (default: 100000)
 *   --host <url>      Server WebSocket URL (default: ws://localhost:8080)
 *   --ramp <ms>       Time to ramp up all connections (default: 10000)
 *   --duration <s>    How long to run after all connected (default: 10)
 *   --admin <secret>  Admin secret for demo mode
 */

import { cpus, freemem, totalmem } from "os";

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const TOTAL_CLIENTS = parseInt(getArg("clients", "2500"));
const ROOM_ID = getArg("room", "100000");
const WS_HOST = getArg("host", "ws://localhost:8080");
const RAMP_MS = parseInt(getArg("ramp", "10000"));
const DURATION_S = parseInt(getArg("duration", "10"));
const ADMIN_SECRET = getArg("admin", "");
const HTTP_BASE = WS_HOST.replace("ws://", "http://").replace("wss://", "https://");

// ── Metrics ──────────────────────────────────────────────────────────
interface Metrics {
  connectAttempts: number;
  connectSuccesses: number;
  connectFailures: number;
  messagesSent: number;
  messagesReceived: number;
  ntpResponsesReceived: number;
  ntpMinRtt: number;
  ntpMaxRtt: number;
  ntpRttSum: number;
  ntpRttCount: number;
  audioLoadRequests: number;
  audioLoadResponses: number;
  errors: string[];
  openConnections: number;
  peakConnections: number;
}

const metrics: Metrics = {
  connectAttempts: 0,
  connectSuccesses: 0,
  connectFailures: 0,
  messagesSent: 0,
  messagesReceived: 0,
  ntpResponsesReceived: 0,
  ntpMinRtt: Infinity,
  ntpMaxRtt: 0,
  ntpRttSum: 0,
  ntpRttCount: 0,
  audioLoadRequests: 0,
  audioLoadResponses: 0,
  errors: [],
  openConnections: 0,
  peakConnections: 0,
};

// ── Resource Monitoring ──────────────────────────────────────────────

interface ResourceSnapshot {
  timestamp: number;
  phase: string;
  // Load test process
  loadTestRssMB: number;
  loadTestHeapMB: number;
  // Server process (from /stats endpoint)
  serverRssMB: number;
  serverHeapMB: number;
  // System
  systemFreeMB: number;
  systemTotalMB: number;
  cpuCount: number;
  // Derived
  connections: number;
  avgRtt: number;
}

const resourceSnapshots: ResourceSnapshot[] = [];
let resourceInterval: ReturnType<typeof setInterval> | null = null;
let currentPhase = "idle";

// Track peak values
let peakLoadTestRss = 0;
let peakServerRss = 0;
let peakSystemUsedPct = 0;

function parseMB(str: string): number {
  const match = /^([\d.]+)\s*MB$/.exec(str);
  return match ? parseFloat(match[1]) : 0;
}

async function sampleResources(): Promise<void> {
  const mem = process.memoryUsage();
  const loadTestRssMB = mem.rss / 1024 / 1024;
  const loadTestHeapMB = mem.heapUsed / 1024 / 1024;

  let serverRssMB = 0;
  let serverHeapMB = 0;

  try {
    const resp = await fetch(`${HTTP_BASE}/stats`);
    if (resp.ok) {
      const stats = (await resp.json()) as {
        memory: { process: { rss: string; heapUsed: string } };
      };
      serverRssMB = parseMB(stats.memory.process.rss);
      serverHeapMB = parseMB(stats.memory.process.heapUsed);
    }
  } catch {
    // Server might be overloaded, skip this sample
  }

  const systemFreeMB = freemem() / 1024 / 1024;
  const systemTotalMB = totalmem() / 1024 / 1024;
  const systemUsedPct = ((systemTotalMB - systemFreeMB) / systemTotalMB) * 100;
  const avgRtt = getAvgRtt();

  // Update peaks
  if (loadTestRssMB > peakLoadTestRss) peakLoadTestRss = loadTestRssMB;
  if (serverRssMB > peakServerRss) peakServerRss = serverRssMB;
  if (systemUsedPct > peakSystemUsedPct) peakSystemUsedPct = systemUsedPct;

  resourceSnapshots.push({
    timestamp: Date.now(),
    phase: currentPhase,
    loadTestRssMB,
    loadTestHeapMB,
    serverRssMB,
    serverHeapMB,
    systemFreeMB,
    systemTotalMB,
    cpuCount: cpus().length,
    connections: metrics.openConnections,
    avgRtt,
  });
}

function startResourceMonitoring(): void {
  // Sample every 2s
  resourceInterval = setInterval(() => void sampleResources(), 2000);
  // Take an immediate sample
  void sampleResources();
}

function stopResourceMonitoring(): void {
  if (resourceInterval) {
    clearInterval(resourceInterval);
    resourceInterval = null;
  }
}

function epochNow(): number {
  return performance.timeOrigin + performance.now();
}

function getAvgRtt(): number {
  return metrics.ntpRttCount > 0 ? metrics.ntpRttSum / metrics.ntpRttCount : 0;
}

// ── Client Simulation ────────────────────────────────────────────────

interface SimulatedClient {
  ws: WebSocket;
  clientId: string;
  username: string;
  probeGroupId: number;
  ntpInterval: ReturnType<typeof setInterval> | null;
  isConnected: boolean;
}

const clients: SimulatedClient[] = [];
let probeGroupCounter = 0;

function createClient(index: number): Promise<SimulatedClient> {
  return new Promise((resolve, reject) => {
    const clientId = crypto.randomUUID();
    const username = `loadtest-${index}`;

    const params = new URLSearchParams({
      roomId: ROOM_ID,
      username,
      clientId,
    });
    if (ADMIN_SECRET) {
      params.set("admin", ADMIN_SECRET);
    }

    const url = `${WS_HOST}/ws?${params.toString()}`;

    metrics.connectAttempts++;

    const client: SimulatedClient = {
      ws: null as unknown as WebSocket,
      clientId,
      username,
      probeGroupId: 0,
      ntpInterval: null,
      isConnected: false,
    };

    const timeout = setTimeout(() => {
      metrics.connectFailures++;
      reject(new Error(`Connection timeout for client ${index}`));
    }, 10_000);

    const ws = new WebSocket(url);

    ws.onopen = () => {
      clearTimeout(timeout);
      metrics.connectSuccesses++;
      metrics.openConnections++;
      if (metrics.openConnections > metrics.peakConnections) {
        metrics.peakConnections = metrics.openConnections;
      }
      client.isConnected = true;

      // Start initial rapid NTP sync (mimic client: ~40 probes over ~2s)
      startInitialSync(client);

      resolve(client);
    };

    ws.onmessage = (event) => {
      metrics.messagesReceived++;
      try {
        const data = JSON.parse(event.data as string);
        handleServerMessage(client, data);
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      metrics.connectFailures++;
      // onerror gives no useful info — onclose has the code/reason
    };

    ws.onclose = (event) => {
      if (client.isConnected) {
        client.isConnected = false;
        metrics.openConnections--;
      }
      if (client.ntpInterval) {
        clearInterval(client.ntpInterval);
        client.ntpInterval = null;
      }
      // Log unexpected closes (not clean close by us)
      if (event.code !== 1000 && event.code !== 1001) {
        const reason = event.reason || "no reason";
        const errorMsg = `Client ${index} closed: code=${event.code} reason="${reason}"`;
        if (metrics.errors.length < 50) {
          metrics.errors.push(errorMsg);
        }
      }
    };

    client.ws = ws;
  });
}

function sendMessage(client: SimulatedClient, msg: Record<string, unknown>): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(msg));
    metrics.messagesSent++;
  }
}

function sendNtpProbe(client: SimulatedClient, groupIndex: 0 | 1): void {
  const msg = {
    type: "NTP_REQUEST",
    t0: epochNow(),
    probeGroupId: client.probeGroupId,
    probeGroupIndex: groupIndex,
  };
  sendMessage(client, msg);
}

function sendCodedProbePair(client: SimulatedClient): void {
  client.probeGroupId = ++probeGroupCounter;
  sendNtpProbe(client, 0);
  // Second probe after ~5ms gap (PROBE_GAP_MS)
  setTimeout(() => sendNtpProbe(client, 1), 5);
}

function startInitialSync(client: SimulatedClient): void {
  // Send ~20 coded probe pairs (40 messages) over ~2 seconds
  // Interval: 30ms between pairs (INITIAL_INTERVAL_MS)
  let probeCount = 0;
  const maxProbes = 20;

  const interval = setInterval(() => {
    if (!client.isConnected || probeCount >= maxProbes) {
      clearInterval(interval);
      // Transition to steady-state NTP pings
      startSteadyStateSync(client);
      return;
    }
    sendCodedProbePair(client);
    probeCount++;
  }, 30);
}

function startSteadyStateSync(client: SimulatedClient): void {
  // Steady-state: one coded probe pair every 2.5s
  client.ntpInterval = setInterval(() => {
    if (client.isConnected) {
      sendCodedProbePair(client);
    }
  }, 2500);
}

function handleServerMessage(
  client: SimulatedClient,
  data: { type: string; t0?: number; event?: { type: string; audioSourceToPlay?: { url: string } } }
): void {
  switch (data.type) {
    case "NTP_RESPONSE": {
      metrics.ntpResponsesReceived++;
      if (data.t0) {
        const rtt = epochNow() - data.t0;
        metrics.ntpRttSum += rtt;
        metrics.ntpRttCount++;
        if (rtt < metrics.ntpMinRtt) metrics.ntpMinRtt = rtt;
        if (rtt > metrics.ntpMaxRtt) metrics.ntpMaxRtt = rtt;
      }
      break;
    }
    case "ROOM_EVENT": {
      if (data.event?.type === "LOAD_AUDIO_SOURCE" && data.event.audioSourceToPlay) {
        metrics.audioLoadRequests++;
        // Simulate audio loading delay (50-200ms)
        const delay = 50 + Math.random() * 150;
        setTimeout(() => {
          sendMessage(client, {
            type: "AUDIO_SOURCE_LOADED",
            source: { url: data.event!.audioSourceToPlay!.url },
          });
          metrics.audioLoadResponses++;
        }, delay);
      }
      break;
    }
    // All other messages silently consumed
  }
}

// ── Reporting ────────────────────────────────────────────────────────

function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(0)}MB`;
}

function printMetrics(): void {
  const avgRtt = getAvgRtt();
  const minRtt = metrics.ntpMinRtt === Infinity ? 0 : metrics.ntpMinRtt;

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  BEATSYNC LOAD TEST RESULTS");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  Target clients:       ${TOTAL_CLIENTS}`);
  console.log(`  Room ID:              ${ROOM_ID}`);
  console.log(`  Ramp time:            ${RAMP_MS}ms`);
  console.log(`  Steady-state dur:     ${DURATION_S}s`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  CONNECTIONS");
  console.log(`    Attempted:          ${metrics.connectAttempts}`);
  console.log(`    Succeeded:          ${metrics.connectSuccesses}`);
  console.log(`    Failed:             ${metrics.connectFailures}`);
  console.log(`    Currently open:     ${metrics.openConnections}`);
  console.log(`    Peak concurrent:    ${metrics.peakConnections}`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  MESSAGES");
  console.log(`    Sent:               ${metrics.messagesSent}`);
  console.log(`    Received:           ${metrics.messagesReceived}`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  NTP SYNC");
  console.log(`    Responses:          ${metrics.ntpResponsesReceived}`);
  console.log(`    Min RTT:            ${minRtt.toFixed(2)}ms`);
  console.log(`    Avg RTT:            ${avgRtt.toFixed(2)}ms`);
  console.log(`    Max RTT:            ${metrics.ntpMaxRtt.toFixed(2)}ms`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  AUDIO LOADING");
  console.log(`    Load requests:      ${metrics.audioLoadRequests}`);
  console.log(`    Load responses:     ${metrics.audioLoadResponses}`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  RESOURCES (peak)");
  console.log(`    Load test RSS:      ${formatMB(peakLoadTestRss)}`);
  console.log(`    Server RSS:         ${formatMB(peakServerRss)}`);
  console.log(`    System memory used: ${peakSystemUsedPct.toFixed(1)}%`);
  if (resourceSnapshots.length > 0) {
    const last = resourceSnapshots[resourceSnapshots.length - 1];
    console.log(`    CPU cores:          ${last.cpuCount}`);
  }
  console.log("──────────────────────────────────────────────────────");

  // Resource timeline
  if (resourceSnapshots.length > 0) {
    console.log("  RESOURCE TIMELINE");
    const start = resourceSnapshots[0].timestamp;
    for (const snap of resourceSnapshots) {
      const t = ((snap.timestamp - start) / 1000).toFixed(0).padStart(3);
      const conn = String(snap.connections).padStart(6);
      const rtt = snap.avgRtt.toFixed(1).padStart(8);
      const ltRss = formatMB(snap.loadTestRssMB).padStart(7);
      const srvRss = formatMB(snap.serverRssMB).padStart(7);
      const sysPct = (((snap.systemTotalMB - snap.systemFreeMB) / snap.systemTotalMB) * 100)
        .toFixed(0)
        .padStart(3);
      console.log(
        `    ${t}s | ${snap.phase.padEnd(6)} | conn:${conn} | rtt:${rtt}ms | lt:${ltRss} srv:${srvRss} | sys:${sysPct}%`
      );
    }
    console.log("──────────────────────────────────────────────────────");
  }

  if (metrics.errors.length > 0) {
    console.log("  ERRORS (first 10):");
    metrics.errors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
    if (metrics.errors.length > 10) {
      console.log(`    ... and ${metrics.errors.length - 10} more`);
    }
    console.log("──────────────────────────────────────────────────────");
  }

  // Verdict
  const successRate = metrics.connectAttempts > 0 ? (metrics.connectSuccesses / metrics.connectAttempts) * 100 : 0;

  console.log("  VERDICT");
  console.log(`    Connection rate:    ${successRate.toFixed(1)}%`);
  if (avgRtt < 5) {
    console.log(`    NTP quality:        EXCELLENT (<5ms avg RTT)`);
  } else if (avgRtt < 20) {
    console.log(`    NTP quality:        GOOD (<20ms avg RTT)`);
  } else if (avgRtt < 50) {
    console.log(`    NTP quality:        ACCEPTABLE (<50ms avg RTT)`);
  } else {
    console.log(`    NTP quality:        POOR (${avgRtt.toFixed(0)}ms avg RTT)`);
  }
  console.log("══════════════════════════════════════════════════════\n");
}

let liveInterval: ReturnType<typeof setInterval> | null = null;

function startLiveReporting(): void {
  liveInterval = setInterval(() => {
    const avgRtt = getAvgRtt();
    const mem = process.memoryUsage();
    const ltRss = formatMB(mem.rss / 1024 / 1024);
    process.stdout.write(
      `\r  Conn: ${metrics.openConnections}/${TOTAL_CLIENTS}` +
        ` | RTT: ${avgRtt.toFixed(1)}ms` +
        ` | Msgs: ${metrics.messagesSent}` +
        ` | Err: ${metrics.connectFailures}` +
        ` | LT: ${ltRss}` +
        ` | Srv: ${formatMB(peakServerRss)}     `
    );
  }, 500);
}

function stopLiveReporting(): void {
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
    console.log(""); // newline after \r output
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nBeatsync Load Test`);
  console.log(`  Target: ${TOTAL_CLIENTS} clients → room ${ROOM_ID}`);
  console.log(`  Server: ${WS_HOST}`);
  console.log(`  Ramp: ${RAMP_MS}ms, Duration: ${DURATION_S}s\n`);

  // Check server is reachable
  try {
    const healthCheck = await fetch(`${HTTP_BASE}/`);
    if (!healthCheck.ok) {
      console.error(`Server returned ${healthCheck.status}. Is the server running?`);
      process.exit(1);
    }
    console.log("  Server is reachable.\n");
  } catch {
    console.error(`Cannot reach server at ${WS_HOST}. Is it running?`);
    process.exit(1);
  }

  startResourceMonitoring();

  console.log("  Phase 1: Ramping up connections (front-weighted random)...");
  currentPhase = "ramp";
  startLiveReporting();

  // Front-weighted random distribution using exponential (lambda=3)
  const connectionPromises: Promise<SimulatedClient>[] = [];

  for (let i = 0; i < TOTAL_CLIENTS; i++) {
    const lambda = 3;
    const u = Math.random();
    const normalized = (1 - Math.exp(-lambda * u)) / (1 - Math.exp(-lambda));
    const delay = normalized * RAMP_MS;
    connectionPromises.push(
      new Promise<SimulatedClient>((resolve, reject) => {
        setTimeout(() => {
          createClient(i).then(resolve, reject);
        }, delay);
      }).catch(() => null as unknown as SimulatedClient)
    );
  }

  // Wait for all connections to settle, with a hard timeout
  const RAMP_TIMEOUT_MS = RAMP_MS + 15_000;
  const rampDeadline = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), RAMP_TIMEOUT_MS));

  const rampResult = await Promise.race([
    Promise.allSettled(connectionPromises).then((r) => r),
    rampDeadline,
  ]);

  if (rampResult !== "timeout") {
    rampResult.forEach((r) => {
      if (r.status === "fulfilled" && r.value) {
        clients.push(r.value);
      }
    });
  }

  stopLiveReporting();
  if (rampResult === "timeout") {
    console.log(`  Ramp timed out after ${(RAMP_TIMEOUT_MS / 1000).toFixed(0)}s — ${metrics.openConnections} connected\n`);
  } else {
    console.log(`  Phase 1 complete: ${metrics.openConnections} connected\n`);
  }

  // Phase 2: Steady state with early exit on degradation
  console.log(`  Phase 2: Steady-state NTP pings for ${DURATION_S}s...`);
  currentPhase = "steady";
  startLiveReporting();

  const steadyStartConnections = metrics.openConnections;
  const steadyEndTime = Date.now() + DURATION_S * 1000;

  while (Date.now() < steadyEndTime) {
    await new Promise((r) => setTimeout(r, 500));

    if (steadyStartConnections > 0) {
      const dropPct = ((steadyStartConnections - metrics.openConnections) / steadyStartConnections) * 100;
      if (dropPct > 25) {
        console.log("");
        console.log(`  Early exit: lost ${dropPct.toFixed(0)}% of connections (${steadyStartConnections} → ${metrics.openConnections})`);
        break;
      }
    }
  }

  stopLiveReporting();
  console.log("  Phase 2 complete.\n");

  // Phase 3: Cleanup
  console.log("  Phase 3: Closing connections...");
  currentPhase = "close";
  for (const client of clients) {
    if (client.ntpInterval) {
      clearInterval(client.ntpInterval);
    }
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }
  }

  // Give sockets time to close
  await new Promise((r) => setTimeout(r, 2000));

  // Final resource sample
  await sampleResources();
  stopResourceMonitoring();

  printMetrics();
  process.exit(0);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
