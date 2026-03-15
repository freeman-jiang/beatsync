/**
 * Beatsync Demo Load Test — Simulates the Symposium demo scenario
 *
 * Realistic client flow for DEMO=1 mode:
 *   1. Connect WS with roomId/username/clientId
 *   2. Receive initial state (audio sources, playback controls, volume, etc.)
 *   3. Run NTP sync probes (coded probe pairs, ~16 measurements over ~500ms)
 *   4. After sync: eager-load ALL audio files via HTTP (demo mode behavior)
 *   5. Respond to LOAD_AUDIO_SOURCE by downloading audio + sending AUDIO_SOURCE_LOADED
 *   6. Continue steady-state NTP pings every 2.5s
 *
 * Usage:
 *   bun run scripts/load-test-demo.ts [options]
 *
 * Options:
 *   --clients <n>     Number of clients to simulate (default: 2500)
 *   --room <id>       Room ID to join (default: 000000)
 *   --host <url>      Server WebSocket URL (default: ws://localhost)
 *   --ramp <ms>       Time to ramp up all connections (default: 15000)
 *   --duration <s>    How long to run after all connected (default: 10)
 *   --admin <secret>  Admin secret for demo mode
 *   --skip-audio      Skip audio downloads (WS-only stress test)
 */

import { cpus, freemem, totalmem } from "os";

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const TOTAL_CLIENTS = parseInt(getArg("clients", "2500"));
const ROOM_ID = getArg("room", "000000");
const WS_HOST = getArg("host", "ws://localhost");
const RAMP_MS = parseInt(getArg("ramp", "15000"));
const DURATION_S = parseInt(getArg("duration", "10"));
const ADMIN_SECRET = getArg("admin", "");
const SKIP_AUDIO = hasFlag("skip-audio");
const HTTP_BASE = WS_HOST.replace("ws://", "http://").replace("wss://", "https://");

// NTP constants matching the real client
const NTP_INITIAL_INTERVAL_MS = 30;
const NTP_STEADY_STATE_INTERVAL_MS = 2500;
const NTP_MAX_MEASUREMENTS = 16;
const NTP_PROBE_GAP_MS = 5;

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
  audioDownloads: number;
  audioDownloadBytes: number;
  audioDownloadFailures: number;
  audioDownloadTotalMs: number;
  errors: string[];
  openConnections: number;
  peakConnections: number;
  clientsSynced: number;
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
  audioDownloads: 0,
  audioDownloadBytes: 0,
  audioDownloadFailures: 0,
  audioDownloadTotalMs: 0,
  errors: [],
  openConnections: 0,
  peakConnections: 0,
  clientsSynced: 0,
};

// ── Audio Download ───────────────────────────────────────────────────
// Every client downloads every file independently, just like real phones.
// We consume and discard the body to avoid holding GBs in memory.

async function downloadAudio(url: string): Promise<boolean> {
  const start = performance.now();
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      metrics.audioDownloadFailures++;
      return false;
    }
    // Stream and discard — stresses server I/O without holding bytes in memory
    const reader = resp.body?.getReader();
    if (!reader) {
      metrics.audioDownloadFailures++;
      return false;
    }
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
    }
    metrics.audioDownloads++;
    metrics.audioDownloadBytes += totalBytes;
    metrics.audioDownloadTotalMs += performance.now() - start;
    return true;
  } catch {
    metrics.audioDownloadFailures++;
    return false;
  }
}

// ── Resource Monitoring ──────────────────────────────────────────────

interface ResourceSnapshot {
  timestamp: number;
  phase: string;
  loadTestRssMB: number;
  loadTestHeapMB: number;
  serverRssMB: number;
  serverHeapMB: number;
  systemFreeMB: number;
  systemTotalMB: number;
  cpuCount: number;
  connections: number;
  avgRtt: number;
}

const resourceSnapshots: ResourceSnapshot[] = [];
let resourceInterval: ReturnType<typeof setInterval> | null = null;
let currentPhase = "idle";

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
  resourceInterval = setInterval(() => void sampleResources(), 2000);
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
  ntpMeasurements: number;
  isSynced: boolean;
  audioSources: string[];
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
      ntpMeasurements: 0,
      isSynced: false,
      audioSources: [],
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

      // Start NTP sync (matches real client: 30ms intervals, coded probe pairs)
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
  sendMessage(client, {
    type: "NTP_REQUEST",
    t0: epochNow(),
    probeGroupId: client.probeGroupId,
    probeGroupIndex: groupIndex,
  });
}

function sendCodedProbePair(client: SimulatedClient): void {
  client.probeGroupId = ++probeGroupCounter;
  sendNtpProbe(client, 0);
  setTimeout(() => sendNtpProbe(client, 1), NTP_PROBE_GAP_MS);
}

function startInitialSync(client: SimulatedClient): void {
  let probeCount = 0;

  const interval = setInterval(() => {
    if (!client.isConnected || probeCount >= NTP_MAX_MEASUREMENTS) {
      clearInterval(interval);
      onSyncComplete(client);
      return;
    }
    sendCodedProbePair(client);
    probeCount++;
  }, NTP_INITIAL_INTERVAL_MS);
}

function onSyncComplete(client: SimulatedClient): void {
  client.isSynced = true;
  metrics.clientsSynced++;

  // Start steady-state NTP pings
  client.ntpInterval = setInterval(() => {
    if (client.isConnected) {
      sendCodedProbePair(client);
    }
  }, NTP_STEADY_STATE_INTERVAL_MS);

  // Demo mode: eager-load ALL audio sources after sync
  if (!SKIP_AUDIO && client.audioSources.length > 0) {
    for (const url of client.audioSources) {
      void downloadAudioAndNotify(client, url);
    }
  }
}

async function downloadAudioAndNotify(client: SimulatedClient, audioUrl: string): Promise<void> {
  const ok = await downloadAudio(audioUrl);
  if (ok && client.isConnected) {
    sendMessage(client, {
      type: "AUDIO_SOURCE_LOADED",
      source: { url: audioUrl },
    });
    metrics.audioLoadResponses++;
  }
}

interface ServerMessage {
  type: string;
  t0?: number;
  event?: {
    type: string;
    sources?: Array<{ url: string }>;
    audioSourceToPlay?: { url: string };
    currentAudioSource?: string;
  };
  serverTimeToExecute?: number;
  scheduledAction?: {
    type: string;
    audioSource?: string;
    trackTimeSeconds?: number;
  };
}

function handleServerMessage(client: SimulatedClient, data: ServerMessage): void {
  switch (data.type) {
    case "NTP_RESPONSE": {
      metrics.ntpResponsesReceived++;
      client.ntpMeasurements++;
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
      if (!data.event) break;

      if (data.event.type === "SET_AUDIO_SOURCES" && data.event.sources) {
        // Store audio source URLs for eager loading after sync
        // Resolve relative URLs (demo mode serves at /audio/...)
        client.audioSources = data.event.sources.map((s) =>
          s.url.startsWith("/") ? `${HTTP_BASE}${s.url}` : s.url
        );
      }

      if (data.event.type === "LOAD_AUDIO_SOURCE" && data.event.audioSourceToPlay) {
        metrics.audioLoadRequests++;
        const rawUrl = data.event.audioSourceToPlay.url;
        const url = rawUrl.startsWith("/") ? `${HTTP_BASE}${rawUrl}` : rawUrl;

        if (SKIP_AUDIO) {
          // Fake it — just send loaded response after short delay
          const delay = 50 + Math.random() * 150;
          setTimeout(() => {
            sendMessage(client, {
              type: "AUDIO_SOURCE_LOADED",
              source: { url },
            });
            metrics.audioLoadResponses++;
          }, delay);
        } else {
          // Actually download the audio file
          void downloadAudioAndNotify(client, url);
        }
      }
      break;
    }

    // SCHEDULED_ACTION, etc. — silently consumed
  }
}

// ── Reporting ────────────────────────────────────────────────────────

// ANSI helpers (zero deps)
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(0)}MB`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function colorValue(value: string | number, color = c.white): string {
  return `${color}${value}${c.reset}`;
}

function row(label: string, value: string | number, color = c.white): string {
  return `  ${c.dim}${label.padEnd(22)}${c.reset}${color}${value}${c.reset}`;
}

function header(title: string): string {
  return `\n  ${c.bold}${c.cyan}${title}${c.reset}`;
}

function divider(): string {
  return `  ${c.dim}${"─".repeat(50)}${c.reset}`;
}

function rttColor(avgRtt: number): string {
  if (avgRtt < 5) return c.green;
  if (avgRtt < 20) return c.yellow;
  if (avgRtt < 50) return c.yellow;
  return c.red;
}

function rttVerdict(avgRtt: number): string {
  if (avgRtt < 5) return `${c.green}EXCELLENT${c.reset} ${c.dim}(<5ms)${c.reset}`;
  if (avgRtt < 20) return `${c.green}GOOD${c.reset} ${c.dim}(<20ms)${c.reset}`;
  if (avgRtt < 50) return `${c.yellow}ACCEPTABLE${c.reset} ${c.dim}(<50ms)${c.reset}`;
  return `${c.red}POOR${c.reset} ${c.dim}(${avgRtt.toFixed(0)}ms)${c.reset}`;
}

function printMetrics(): void {
  const avgRtt = getAvgRtt();
  const minRtt = metrics.ntpMinRtt === Infinity ? 0 : metrics.ntpMinRtt;
  const avgDownloadMs =
    metrics.audioDownloads > 0 ? metrics.audioDownloadTotalMs / metrics.audioDownloads : 0;
  const successRate = metrics.connectAttempts > 0 ? (metrics.connectSuccesses / metrics.connectAttempts) * 100 : 0;
  const connColor = successRate === 100 ? c.green : successRate > 75 ? c.yellow : c.red;
  const failColor = metrics.connectFailures === 0 ? c.green : c.red;
  const dlFailColor = metrics.audioDownloadFailures === 0 ? c.green : c.red;

  console.log(`\n  ${c.bold}${c.cyan}══════════════════════════════════════════════════${c.reset}`);
  console.log(`  ${c.bold}  BEATSYNC DEMO LOAD TEST RESULTS${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}══════════════════════════════════════════════════${c.reset}`);

  // Config
  console.log(header("CONFIG"));
  console.log(row("Target clients", TOTAL_CLIENTS));
  console.log(row("Room ID", ROOM_ID));
  console.log(row("Ramp / Duration", `${RAMP_MS}ms / ${DURATION_S}s`));
  console.log(row("Audio downloads", SKIP_AUDIO ? `${c.yellow}SKIPPED` : `${c.green}ENABLED`));

  // Connections
  console.log(header("CONNECTIONS"));
  console.log(divider());
  console.log(row("Succeeded", `${metrics.connectSuccesses}/${metrics.connectAttempts}`, connColor));
  console.log(row("Failed", metrics.connectFailures, failColor));
  console.log(row("Peak concurrent", metrics.peakConnections, c.white));
  console.log(row("Synced", metrics.clientsSynced, metrics.clientsSynced === metrics.connectSuccesses ? c.green : c.yellow));

  // Messages
  console.log(header("MESSAGES"));
  console.log(divider());
  console.log(row("Sent", metrics.messagesSent.toLocaleString()));
  console.log(row("Received", metrics.messagesReceived.toLocaleString()));

  // NTP
  console.log(header("NTP SYNC"));
  console.log(divider());
  console.log(row("Responses", metrics.ntpResponsesReceived.toLocaleString()));
  console.log(row("Min RTT", `${minRtt.toFixed(2)}ms`, c.green));
  console.log(row("Avg RTT", `${avgRtt.toFixed(2)}ms`, rttColor(avgRtt)));
  console.log(row("Max RTT", `${metrics.ntpMaxRtt.toFixed(2)}ms`, metrics.ntpMaxRtt > 100 ? c.red : c.yellow));

  // Audio
  if (!SKIP_AUDIO) {
    console.log(header("AUDIO"));
    console.log(divider());
    console.log(row("Downloads", metrics.audioDownloads.toLocaleString()));
    console.log(row("Total bytes", formatBytes(metrics.audioDownloadBytes)));
    console.log(row("Avg download time", `${avgDownloadMs.toFixed(0)}ms`));
    console.log(row("Failures", metrics.audioDownloadFailures, dlFailColor));
    console.log(row("Load responses", metrics.audioLoadResponses.toLocaleString()));
  }

  // Resources
  console.log(header("RESOURCES (peak)"));
  console.log(divider());
  console.log(row("Load test RSS", formatMB(peakLoadTestRss)));
  console.log(row("Server RSS", formatMB(peakServerRss)));
  console.log(row("System memory", `${peakSystemUsedPct.toFixed(1)}%`, peakSystemUsedPct > 95 ? c.red : c.white));
  if (resourceSnapshots.length > 0) {
    console.log(row("CPU cores", resourceSnapshots[0].cpuCount));
  }

  // Timeline
  if (resourceSnapshots.length > 0) {
    console.log(header("RESOURCE TIMELINE"));
    console.log(divider());
    const hdr = `  ${c.dim}${"time".padStart(4)}  ${"phase".padEnd(6)}  ${"conn".padStart(6)}  ${"rtt".padStart(9)}  ${"lt-rss".padStart(7)}  ${"srv-rss".padStart(7)}  ${"sys".padStart(4)}${c.reset}`;
    console.log(hdr);
    const start = resourceSnapshots[0].timestamp;
    for (const snap of resourceSnapshots) {
      const t = `${((snap.timestamp - start) / 1000).toFixed(0)}s`.padStart(4);
      const phase = snap.phase.padEnd(6);
      const conn = String(snap.connections).padStart(6);
      const rtt = `${snap.avgRtt.toFixed(1)}ms`.padStart(9);
      const ltRss = formatMB(snap.loadTestRssMB).padStart(7);
      const srvRss = formatMB(snap.serverRssMB).padStart(7);
      const sysPct = `${(((snap.systemTotalMB - snap.systemFreeMB) / snap.systemTotalMB) * 100).toFixed(0)}%`.padStart(4);
      console.log(`  ${c.dim}${t}${c.reset}  ${phase}  ${conn}  ${rtt}  ${ltRss}  ${srvRss}  ${sysPct}`);
    }
  }

  // Errors
  if (metrics.errors.length > 0) {
    console.log(header(`${c.red}ERRORS`));
    console.log(divider());
    metrics.errors.slice(0, 10).forEach((e) => console.log(`  ${c.red}${e}${c.reset}`));
    if (metrics.errors.length > 10) {
      console.log(`  ${c.dim}... and ${metrics.errors.length - 10} more${c.reset}`);
    }
  }

  // Verdict
  console.log(`\n  ${c.bold}${c.cyan}──────────────────────────────────────────────────${c.reset}`);
  console.log(row("Connection rate", `${successRate.toFixed(1)}%`, connColor));
  console.log(row("NTP quality", rttVerdict(avgRtt)));
  console.log(`  ${c.bold}${c.cyan}══════════════════════════════════════════════════${c.reset}\n`);
}

let liveInterval: ReturnType<typeof setInterval> | null = null;

function startLiveReporting(): void {
  liveInterval = setInterval(() => {
    const avgRtt = getAvgRtt();
    const mem = process.memoryUsage();
    const ltRss = formatMB(mem.rss / 1024 / 1024);
    const rc = rttColor(avgRtt);
    const errStr = metrics.connectFailures > 0 ? `${c.red}${metrics.connectFailures}${c.reset}` : `${c.green}0${c.reset}`;
    const dl = SKIP_AUDIO ? "" : ` ${c.dim}|${c.reset} DL:${colorValue(formatBytes(metrics.audioDownloadBytes), c.magenta)}`;
    process.stdout.write(
      `\r  ${c.dim}Conn:${c.reset}${colorValue(`${metrics.openConnections}/${TOTAL_CLIENTS}`, c.cyan)}` +
        ` ${c.dim}Sync:${c.reset}${colorValue(metrics.clientsSynced, c.green)}` +
        ` ${c.dim}RTT:${c.reset}${colorValue(`${avgRtt.toFixed(1)}ms`, rc)}` +
        ` ${c.dim}Msgs:${c.reset}${metrics.messagesSent}` +
        ` ${c.dim}Err:${c.reset}${errStr}` +
        dl +
        ` ${c.dim}LT:${c.reset}${ltRss}` +
        ` ${c.dim}Srv:${c.reset}${formatMB(peakServerRss)}     `
    );
  }, 500);
}

function stopLiveReporting(): void {
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
    console.log("");
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n  ${c.bold}${c.cyan}Beatsync Demo Load Test${c.reset}`);
  console.log(`  ${c.dim}Target:${c.reset} ${c.bold}${TOTAL_CLIENTS}${c.reset} clients → room ${c.bold}${ROOM_ID}${c.reset}`);
  console.log(`  ${c.dim}Server:${c.reset} ${WS_HOST}`);
  console.log(`  ${c.dim}Ramp:${c.reset} ${RAMP_MS}ms ${c.dim}Duration:${c.reset} ${DURATION_S}s`);
  console.log(`  ${c.dim}Audio:${c.reset} ${SKIP_AUDIO ? `${c.yellow}SKIPPED${c.reset}` : `${c.green}ENABLED${c.reset} ${c.dim}(real HTTP downloads)${c.reset}`}\n`);

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
    console.log(`  Phase 1 complete: ${metrics.openConnections} connected, ${metrics.clientsSynced} synced\n`);
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

  await new Promise((r) => setTimeout(r, 2000));

  await sampleResources();
  stopResourceMonitoring();

  printMetrics();
  process.exit(0);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
