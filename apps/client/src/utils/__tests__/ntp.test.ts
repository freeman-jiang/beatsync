// Tests the NTP sync pure functions: offset estimation (best-half filtering),
// wait time calculation, and NTP measurement creation from server timestamps.

import { describe, expect, it, mock } from "bun:test";
import { calculateOffsetEstimate, calculateWaitTimeMilliseconds, type NTPMeasurement } from "@/utils/ntp";
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

describe("calculateOffsetEstimate", () => {
  it("should use only the best half of measurements by RTT for offset", () => {
    // 4 measurements: best half (lowest RTT) = first 2
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 20, clockOffset: 110 }),
      createMeasurement({ roundTripDelay: 200, clockOffset: 500 }), // noisy — should be excluded
      createMeasurement({ roundTripDelay: 300, clockOffset: 800 }), // noisy — should be excluded
    ];

    const result = calculateOffsetEstimate(measurements);

    // Best half = measurements with RTT 10 and 20, offsets 100 and 110
    // Average offset = (100 + 110) / 2 = 105
    expect(result.averageOffset).toBe(105);

    // Average round trip uses ALL measurements: (10 + 20 + 200 + 300) / 4 = 132.5
    expect(result.averageRoundTrip).toBe(132.5);
  });

  it("should handle a single measurement", () => {
    const measurements: NTPMeasurement[] = [createMeasurement({ roundTripDelay: 50, clockOffset: 200 })];

    const result = calculateOffsetEstimate(measurements);

    // Single measurement: best half = ceil(1/2) = 1, so it uses the only measurement
    expect(result.averageOffset).toBe(200);
    expect(result.averageRoundTrip).toBe(50);
  });

  it("should handle odd number of measurements (ceil for best half)", () => {
    // 3 measurements: best half = ceil(3/2) = 2
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: 100 }),
      createMeasurement({ roundTripDelay: 30, clockOffset: 120 }),
      createMeasurement({ roundTripDelay: 500, clockOffset: 900 }), // excluded
    ];

    const result = calculateOffsetEstimate(measurements);

    // Best 2: offsets 100 and 120 → average = 110
    expect(result.averageOffset).toBe(110);
  });

  it("should handle negative clock offsets (client ahead of server)", () => {
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 10, clockOffset: -50 }),
      createMeasurement({ roundTripDelay: 15, clockOffset: -55 }),
      createMeasurement({ roundTripDelay: 12, clockOffset: -48 }),
      createMeasurement({ roundTripDelay: 500, clockOffset: -200 }), // spike — excluded
    ];

    const result = calculateOffsetEstimate(measurements);

    // Best half = ceil(4/2) = 2 (RTT 10 and 12), offsets -50 and -48
    // Average offset = (-50 + -48) / 2 = -49
    expect(result.averageOffset).toBe(-49);
  });

  it("should filter out spiky measurements from offset calculation", () => {
    // Simulate a realistic scenario: 10 measurements, 2 have high RTT spikes
    const goodOffset = 150;
    const measurements: NTPMeasurement[] = [
      createMeasurement({ roundTripDelay: 20, clockOffset: goodOffset }),
      createMeasurement({ roundTripDelay: 22, clockOffset: goodOffset + 1 }),
      createMeasurement({ roundTripDelay: 18, clockOffset: goodOffset - 1 }),
      createMeasurement({ roundTripDelay: 25, clockOffset: goodOffset + 2 }),
      createMeasurement({ roundTripDelay: 21, clockOffset: goodOffset }),
      createMeasurement({ roundTripDelay: 19, clockOffset: goodOffset - 1 }),
      createMeasurement({ roundTripDelay: 23, clockOffset: goodOffset + 1 }),
      createMeasurement({ roundTripDelay: 24, clockOffset: goodOffset + 2 }),
      // Spikes — these should be excluded from offset calculation
      createMeasurement({ roundTripDelay: 500, clockOffset: goodOffset + 200 }),
      createMeasurement({ roundTripDelay: 800, clockOffset: goodOffset - 300 }),
    ];

    const result = calculateOffsetEstimate(measurements);

    // The offset should be close to 150, not pulled by the spikes
    expect(result.averageOffset).toBeGreaterThan(145);
    expect(result.averageOffset).toBeLessThan(155);
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
