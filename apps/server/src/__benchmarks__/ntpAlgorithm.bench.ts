/**
 * NTP Algorithm Benchmark (pure math simulation, no real network)
 *
 * Fabricates NTP timestamps with injected delay profiles and compares
 * offset estimation algorithms. Ground truth offset = 0.
 *
 * Tests algorithm quality in isolation from transport/event-loop noise.
 * See ntpProtocol.bench.ts for real WebSocket benchmarks.
 *
 * Run: bun run src/__benchmarks__/ntpAlgorithm.bench.ts
 */

import { epochNow } from "@beatsync/shared";

// ---------------------------------------------------------------------------
// Delay profiles
// ---------------------------------------------------------------------------

interface DelayProfile {
  name: string;
  /** Return [forwardDelayMs, reverseDelayMs] for a given measurement index */
  getDelay: (index: number) => [number, number];
}

const profiles: DelayProfile[] = [
  {
    name: "Symmetric LAN (2ms)",
    getDelay: () => [1, 1],
  },
  {
    name: "Symmetric WAN (60ms)",
    getDelay: () => [30, 30],
  },
  {
    name: "Asymmetric WiFi (upload congested)",
    getDelay: () => [40, 10], // 50ms RTT but 30ms asymmetry
  },
  {
    name: "Bursty jitter (bufferbloat)",
    getDelay: (i) => {
      // Every ~5th measurement gets a spike
      const spike = i % 5 === 0;
      const base = 15;
      const jitter = spike ? 80 + Math.random() * 120 : Math.random() * 5;
      return [base + jitter, base + Math.random() * 5];
    },
  },
  {
    name: "PSM spikes (power save mode)",
    getDelay: (i) => {
      // Every ~8th measurement, downlink has 150-300ms PSM delay
      const psmEvent = i % 8 === 0;
      const forward = 5 + Math.random() * 3;
      const reverse = psmEvent ? 150 + Math.random() * 150 : 5 + Math.random() * 3;
      return [forward, reverse];
    },
  },
  {
    name: "Mixed realistic WiFi",
    getDelay: (_i) => {
      // Combination: base asymmetry + occasional spikes
      const baseForward = 8 + Math.random() * 4;
      const baseReverse = 3 + Math.random() * 2;
      // 10% chance of a congestion spike on upload
      const spike = Math.random() < 0.1 ? 50 + Math.random() * 100 : 0;
      return [baseForward + spike, baseReverse];
    },
  },
];

// ---------------------------------------------------------------------------
// NTP measurement simulation (client-side logic)
// ---------------------------------------------------------------------------

interface NTPMeasurement {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  roundTripDelay: number;
  clockOffset: number;
}

function computeMeasurement(data: { t0: number; t1: number; t2: number; t3: number }): NTPMeasurement {
  const { t0, t1, t2, t3 } = data;
  return {
    t0,
    t1,
    t2,
    t3,
    roundTripDelay: t3 - t0 - (t2 - t1),
    clockOffset: (t1 - t0 + (t2 - t3)) / 2,
  };
}

// ---------------------------------------------------------------------------
// Offset estimation algorithms to benchmark
// ---------------------------------------------------------------------------

interface Algorithm {
  name: string;
  estimate: (measurements: NTPMeasurement[]) => number;
}

const algorithms: Algorithm[] = [
  {
    name: "Best-half average (current)",
    estimate: (measurements) => {
      const sorted = [...measurements].sort((a, b) => a.roundTripDelay - b.roundTripDelay);
      const bestHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
      return bestHalf.reduce((sum, m) => sum + m.clockOffset, 0) / bestHalf.length;
    },
  },
  {
    name: "Min-RTT selection",
    estimate: (measurements) => {
      let minRTT = Infinity;
      let bestOffset = 0;
      for (const m of measurements) {
        if (m.roundTripDelay < minRTT) {
          minRTT = m.roundTripDelay;
          bestOffset = m.clockOffset;
        }
      }
      return bestOffset;
    },
  },
  {
    name: "Median offset (RTT-filtered)",
    estimate: (measurements) => {
      const sorted = [...measurements].sort((a, b) => a.roundTripDelay - b.roundTripDelay);
      const cutoff = Math.ceil(sorted.length * 0.25); // best 25%
      const filtered = sorted.slice(0, Math.max(cutoff, 3));
      const offsets = filtered.map((m) => m.clockOffset).sort((a, b) => a - b);
      return offsets[Math.floor(offsets.length / 2)];
    },
  },
  {
    name: "Min-RTT window (best of last 16)",
    estimate: (measurements) => {
      const window = measurements.slice(-16);
      let minRTT = Infinity;
      let bestOffset = 0;
      for (const m of window) {
        if (m.roundTripDelay < minRTT) {
          minRTT = m.roundTripDelay;
          bestOffset = m.clockOffset;
        }
      }
      return bestOffset;
    },
  },
];

// ---------------------------------------------------------------------------
// Simulated NTP exchange (no real network — pure delay injection)
// ---------------------------------------------------------------------------

function simulateNTPExchange(data: { forwardDelayMs: number; reverseDelayMs: number }): NTPMeasurement {
  const { forwardDelayMs, reverseDelayMs } = data;

  // Since client and server are the same machine, true offset = 0.
  // We simulate what timestamps WOULD look like with network delay.
  const t0 = epochNow();
  const t1 = t0 + forwardDelayMs; // server receive = client send + forward delay
  const t2 = t1 + 0.1; // server processing ~0.1ms
  const t3 = t2 + reverseDelayMs; // client receive = server send + reverse delay

  return computeMeasurement({ t0, t1, t2, t3 });
}

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

const NUM_MEASUREMENTS = 40;
const NUM_TRIALS = 100;

interface BenchmarkResult {
  profile: string;
  algorithm: string;
  meanError: number;
  medianError: number;
  p95Error: number;
  maxError: number;
  stdDev: number;
}

function runBenchmark(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const profile of profiles) {
    for (const algo of algorithms) {
      const errors: number[] = [];

      for (let trial = 0; trial < NUM_TRIALS; trial++) {
        // Generate measurements for this trial
        const measurements: NTPMeasurement[] = [];
        for (let i = 0; i < NUM_MEASUREMENTS; i++) {
          const [fwd, rev] = profile.getDelay(i);
          measurements.push(simulateNTPExchange({ forwardDelayMs: fwd, reverseDelayMs: rev }));
        }

        // Estimate offset — ground truth is 0
        const estimated = algo.estimate(measurements);
        errors.push(Math.abs(estimated));
      }

      // Compute statistics
      errors.sort((a, b) => a - b);
      const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
      const median = errors[Math.floor(errors.length / 2)];
      const p95 = errors[Math.floor(errors.length * 0.95)];
      const max = errors[errors.length - 1];
      const variance = errors.reduce((s, e) => s + (e - mean) ** 2, 0) / errors.length;
      const stdDev = Math.sqrt(variance);

      results.push({
        profile: profile.name,
        algorithm: algo.name,
        meanError: mean,
        medianError: median,
        p95Error: p95,
        maxError: max,
        stdDev,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}μs`;
  return `${ms.toFixed(2)}ms`;
}

function printResults(results: BenchmarkResult[]): void {
  // Group by profile
  const byProfile = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!byProfile.has(r.profile)) byProfile.set(r.profile, []);
    byProfile.get(r.profile)!.push(r);
  }

  console.log("=".repeat(100));
  console.log("NTP Clock Sync Benchmark");
  console.log(`${NUM_MEASUREMENTS} measurements per trial, ${NUM_TRIALS} trials per combination`);
  console.log("Ground truth offset = 0 (same machine). All values are absolute error.");
  console.log("=".repeat(100));

  for (const [profile, algos] of byProfile) {
    console.log(`\n--- ${profile} ---`);
    console.log(
      "  Algorithm".padEnd(35) +
        "Mean".padStart(10) +
        "Median".padStart(10) +
        "P95".padStart(10) +
        "Max".padStart(10) +
        "StdDev".padStart(10)
    );

    // Sort by median error
    const sorted = [...algos].sort((a, b) => a.medianError - b.medianError);

    for (const r of sorted) {
      console.log(
        `  ${r.algorithm}`.padEnd(35) +
          formatMs(r.meanError).padStart(10) +
          formatMs(r.medianError).padStart(10) +
          formatMs(r.p95Error).padStart(10) +
          formatMs(r.maxError).padStart(10) +
          formatMs(r.stdDev).padStart(10)
      );
    }
  }

  console.log("\n" + "=".repeat(100));

  // Summary: best algorithm per profile by median error
  console.log("\nBest algorithm per profile (by median error):");
  for (const [profile, algos] of byProfile) {
    const best = algos.reduce((a, b) => (a.medianError < b.medianError ? a : b));
    console.log(`  ${profile}: ${best.algorithm} (${formatMs(best.medianError)} median)`);
  }
}

// Run
const results = runBenchmark();
printResults(results);
