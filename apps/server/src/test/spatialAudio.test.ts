import { describe, expect, test } from "bun:test";
import {
  gainFromDistanceExp,
  gainFromDistanceLinear,
  gainFromDistanceQuadratic,
} from "../spatial";

describe("Spatial Audio Calculations", () => {
  const source = { x: 0, y: 0 };
  
  test("gainFromDistanceExp should decrease with distance", () => {
    const closeClient = { x: 1, y: 1 };
    const farClient = { x: 10, y: 10 };
    
    const closeGain = gainFromDistanceExp({ client: closeClient, source });
    const farGain = gainFromDistanceExp({ client: farClient, source });
    
    expect(closeGain).toBeGreaterThan(farGain);
    expect(closeGain).toBeLessThanOrEqual(1.0);
    expect(farGain).toBeGreaterThanOrEqual(0.15);
  });

  test("gainFromDistanceLinear should decrease linearly", () => {
    const client1 = { x: 5, y: 0 };
    const client2 = { x: 10, y: 0 };
    
    const gain1 = gainFromDistanceLinear({ client: client1, source });
    const gain2 = gainFromDistanceLinear({ client: client2, source });
    
    expect(gain1).toBeGreaterThan(gain2);
    expect(gain1).toBeLessThanOrEqual(1.0);
    expect(gain2).toBeGreaterThanOrEqual(0.15);
  });

  test("gainFromDistanceQuadratic should decrease quadratically", () => {
    const client1 = { x: 5, y: 0 };
    const client2 = { x: 10, y: 0 };
    
    const gain1 = gainFromDistanceQuadratic({ client: client1, source });
    const gain2 = gainFromDistanceQuadratic({ client: client2, source });
    
    expect(gain1).toBeGreaterThan(gain2);
    expect(gain1).toBeLessThanOrEqual(1.0);
    expect(gain2).toBeGreaterThanOrEqual(0.15);
  });

  test("all gain functions should respect min/max bounds", () => {
    const veryCloseClient = { x: 0.1, y: 0.1 };
    const veryFarClient = { x: 100, y: 100 };
    
    const functions = [
      gainFromDistanceExp,
      gainFromDistanceLinear,
      gainFromDistanceQuadratic,
    ];
    
    functions.forEach(gainFn => {
      const maxGain = gainFn({ client: veryCloseClient, source });
      const minGain = gainFn({ client: veryFarClient, source });
      
      expect(maxGain).toBeLessThanOrEqual(1.0);
      expect(minGain).toBeGreaterThanOrEqual(0.15);
    });
  });
}); 