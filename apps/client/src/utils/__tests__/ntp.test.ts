// Tests the NTP sync pure functions: min-RTT offset selection,
// wait time calculation, and measurement filtering behavior.

import { describe, expect, it, mock } from "bun:test";
import {
  calculateOffsetEstimate,
  calculateWaitTimeMilliseconds,
  filterOutliersByIQR,
  type NTPMeasurement,
} from "@/utils/ntp";
import * as shared from "@beatsync/shared";

const FROZEN_TIME = 10000;

// Mock epochNow to return a fixed value so wait time math is exact
mock.module("@beatsync/shared", () => ({
  ...shared,
  epochNow: () => FROZEN_TIME,
}));

function createMeasurement(data: { roundTripDelay: number; clockOffset: number }): NTPMeasurement {
  return {
    t0: 1000,
    t1: 1000 + data.clockOffset + data.roundTripDelay / 2,
    t2: 1000 + data.clockOffset + data.roundTripDelay / 2,
    t3: 1000 + data.roundTripDelay,
    roundTripDelay: data.roundTripDelay,
    clockOffset: data.clockOffset,
  };
}

describe("filterOutliersByIQR", () => {
  it("should return all measurements when fewer than 4", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 500, clockOffset: 300 }),
    ];
    expect(filterOutliersByIQR(measurements)).toHaveLength(2);
  });

  it("should remove extreme RTT outliers", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 12, clockOffset: 101 }),
      createMeasurement({ roundTripDelay: 14, clockOffset: 102 }),
      createMeasurement({ roundTripDelay: 11, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 13, clockOffset: 101 }),
      createMeasurement({ roundTripDelay: 15, clockOffset: 103 }),
      createMeasurement({ roundTripDelay: 200, clockOffset: 500 }),
      createMeasurement({ roundTripDelay: 800, clockOffset: -50 }),
    ];
    const filtered = filterOutliersByIQR(measurements);
    // Q3=200, IQR=188, upper fence=482 → RTT 800 rejected, RTT 200 passes
    expect(filtered.every((m) => m.roundTripDelay <= 482)).toBe(true);
    expect(filtered.some((m) => m.roundTripDelay === 800)).toBe(false);
    expect(filtered.length).toBe(7);
  });

  it("should always keep at least the min-RTT sample", () => {
    // All "outliers" — IQR is 0 so upperFence = Q3 + 0 = Q3
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
    ];
    const filtered = filterOutliersByIQR(measurements);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });
});

describe("calculateOffsetEstimate", () => {
  it("should average offsets from bottom-quartile RTT cluster", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 20, clockOffset: 110 }),
      createMeasurement({ roundTripDelay: 200, clockOffset: 500 }),
      createMeasurement({ roundTripDelay: 300, clockOffset: 800 }),
    ];

    const result = calculateOffsetEstimate(measurements);

    // Bottom-quartile cluster = 2 lowest-RTT samples: offsets [100, 110] → avg = 105
    expect(result.averageOffset).toBe(105);

    // Average round trip over clean set (all pass IQR): (10 + 20 + 200 + 300) / 4 = 132.5
    expect(result.averageRoundTrip).toBe(132.5);
  });

  it("should ignore high-RTT spikes via clustering", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 18, clockOffset: 149 }),
      createMeasurement({ roundTripDelay: 22, clockOffset: 151 }),
      createMeasurement({ roundTripDelay: 20, clockOffset: 150 }),
      createMeasurement({ roundTripDelay: 500, clockOffset: 350 }),
      createMeasurement({ roundTripDelay: 800, clockOffset: -150 }),
    ];

    const result = calculateOffsetEstimate(measurements);

    // Cluster = 2 lowest-RTT samples: RTT [18, 20] → offsets [149, 150] → avg = 149.5
    expect(result.averageOffset).toBe(149.5);
  });

  it("should handle negative clock offsets (client ahead of server)", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 12, clockOffset: -48 }),
      createMeasurement({ roundTripDelay: 10, clockOffset: -50 }),
      createMeasurement({ roundTripDelay: 15, clockOffset: -55 }),
      createMeasurement({ roundTripDelay: 500, clockOffset: -200 }),
    ];

    const result = calculateOffsetEstimate(measurements);

    // Cluster = 2 lowest-RTT: RTT [10, 12] → offsets [-50, -48] → avg = -49
    expect(result.averageOffset).toBe(-49);
  });

  it("should handle a single measurement", () => {
    const measurements: NTPMeasurement[] = [createMeasurement({ roundTripDelay: 50, clockOffset: 200 })];

    const result = calculateOffsetEstimate(measurements);

    expect(result.averageOffset).toBe(200);
    expect(result.averageRoundTrip).toBe(50);
  });

  it("should handle empty measurements", () => {
    const result = calculateOffsetEstimate([]);
    expect(result.averageOffset).toBe(0);
    expect(result.averageRoundTrip).toBe(0);
  });

  it("should produce tighter estimates with many similar measurements", () => {
    // Simulate realistic LAN scenario: 16 measurements, RTTs 8-25ms, one spike
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 150 }),
      createMeasurement({ roundTripDelay: 12, clockOffset: 151 }),
      createMeasurement({ roundTripDelay: 8, clockOffset: 149 }),
      createMeasurement({ roundTripDelay: 11, clockOffset: 150 }),
      createMeasurement({ roundTripDelay: 14, clockOffset: 152 }),
      createMeasurement({ roundTripDelay: 9, clockOffset: 149 }),
      createMeasurement({ roundTripDelay: 13, clockOffset: 151 }),
      createMeasurement({ roundTripDelay: 15, clockOffset: 152 }),
      createMeasurement({ roundTripDelay: 10, clockOffset: 150 }),
      createMeasurement({ roundTripDelay: 11, clockOffset: 150 }),
      createMeasurement({ roundTripDelay: 16, clockOffset: 153 }),
      createMeasurement({ roundTripDelay: 12, clockOffset: 151 }),
      createMeasurement({ roundTripDelay: 20, clockOffset: 155 }),
      createMeasurement({ roundTripDelay: 25, clockOffset: 158 }),
      createMeasurement({ roundTripDelay: 9, clockOffset: 149 }),
      createMeasurement({ roundTripDelay: 300, clockOffset: 280 }),
    ];

    const result = calculateOffsetEstimate(measurements);

    // With IQR + bottom-quartile clustering, the result should be very close to the
    // true offset (149-150ms) — the 300ms spike should not corrupt the estimate
    expect(result.averageOffset).toBeGreaterThanOrEqual(148);
    expect(result.averageOffset).toBeLessThanOrEqual(152);
  });
});

describe("calculateWaitTimeMilliseconds", () => {
  // epochNow() is mocked to return FROZEN_TIME (10000)

  it("should return exact wait time when target is in the future", () => {
    // estimatedCurrentServerTime = 10000 + 500 = 10500
    // wait = 11000 - 10500 = 500
    expect(calculateWaitTimeMilliseconds(11000, 500)).toBe(500);
  });

  it("should return 0 when target time has already passed", () => {
    // estimatedCurrentServerTime = 10000 + 0 = 10000
    // wait = max(0, 5000 - 10000) = 0
    expect(calculateWaitTimeMilliseconds(5000, 0)).toBe(0);
  });

  it("should handle negative clock offset (client ahead of server)", () => {
    // estimatedCurrentServerTime = 10000 + (-200) = 9800
    // wait = 10300 - 9800 = 500
    expect(calculateWaitTimeMilliseconds(10300, -200)).toBe(500);
  });
});
