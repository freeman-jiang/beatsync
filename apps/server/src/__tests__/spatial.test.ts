import { describe, test, expect } from 'bun:test';
import { calculateGainFromDistanceToSource } from '../spatial';

describe('Spatial Audio Calculations', () => {
  describe('calculateGainFromDistanceToSource', () => {
    test('should return maximum gain (1.0) when client is at source', () => {
      const gain = calculateGainFromDistanceToSource({
        client: { x: 0, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      expect(gain).toBe(1.0);
    });

    test('should return maximum gain for very small distances', () => {
      const gain = calculateGainFromDistanceToSource({
        client: { x: 0.1, y: 0.1 },
        source: { x: 0, y: 0 }
      });
      
      expect(gain).toBeCloseTo(1.0, 2);
    });

    test('should decrease gain with distance', () => {
      const nearGain = calculateGainFromDistanceToSource({
        client: { x: 10, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      const farGain = calculateGainFromDistanceToSource({
        client: { x: 50, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      expect(nearGain).toBeGreaterThan(farGain);
      expect(nearGain).toBeLessThan(1.0);
      expect(farGain).toBeGreaterThan(0);
    });

    test('should calculate distance correctly using Pythagorean theorem', () => {
      // 3-4-5 triangle
      const gain1 = calculateGainFromDistanceToSource({
        client: { x: 3, y: 4 },
        source: { x: 0, y: 0 }
      });
      
      const gain2 = calculateGainFromDistanceToSource({
        client: { x: 5, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      // Both should have same gain since distance is 5 in both cases
      expect(gain1).toBeCloseTo(gain2, 5);
    });

    test('should handle negative coordinates', () => {
      const gain1 = calculateGainFromDistanceToSource({
        client: { x: -20, y: -20 },
        source: { x: 0, y: 0 }
      });
      
      const gain2 = calculateGainFromDistanceToSource({
        client: { x: 20, y: 20 },
        source: { x: 0, y: 0 }
      });
      
      // Distance should be the same regardless of direction
      expect(gain1).toBe(gain2);
      expect(gain1).toBeGreaterThan(0);
      expect(gain1).toBeLessThan(1.0);
    });

    test('should handle source at non-origin position', () => {
      const gain = calculateGainFromDistanceToSource({
        client: { x: 50, y: 50 },
        source: { x: 50, y: 50 }
      });
      
      // Client at source position should have max gain
      expect(gain).toBe(1.0);
    });

    test('should have symmetric gain in all directions', () => {
      const distance = 30;
      const source = { x: 25, y: 25 };
      
      const gains = [
        // Test 8 directions
        calculateGainFromDistanceToSource({
          client: { x: source.x + distance, y: source.y },
          source
        }),
        calculateGainFromDistanceToSource({
          client: { x: source.x - distance, y: source.y },
          source
        }),
        calculateGainFromDistanceToSource({
          client: { x: source.x, y: source.y + distance },
          source
        }),
        calculateGainFromDistanceToSource({
          client: { x: source.x, y: source.y - distance },
          source
        }),
      ];
      
      // All gains should be equal
      const firstGain = gains[0];
      gains.forEach(gain => {
        expect(gain).toBeCloseTo(firstGain, 5);
      });
    });

    test('should handle extreme distances', () => {
      const veryFarGain = calculateGainFromDistanceToSource({
        client: { x: 1000, y: 1000 },
        source: { x: 0, y: 0 }
      });
      
      // Should be very low but not negative
      expect(veryFarGain).toBeGreaterThanOrEqual(0);
      expect(veryFarGain).toBeLessThan(0.2);
    });

    test('should provide reasonable gain at typical distances', () => {
      // Test some typical grid distances
      const typicalDistances = [
        { distance: 0, expectedMin: 1.0, expectedMax: 1.0 },
        { distance: 10, expectedMin: 0.7, expectedMax: 0.95 },
        { distance: 25, expectedMin: 0.3, expectedMax: 0.8 },
        { distance: 50, expectedMin: 0.15, expectedMax: 0.6 },
        { distance: 75, expectedMin: 0.1, expectedMax: 0.4 },
        { distance: 100, expectedMin: 0.05, expectedMax: 0.3 },
      ];
      
      typicalDistances.forEach(({ distance, expectedMin, expectedMax }) => {
        const gain = calculateGainFromDistanceToSource({
          client: { x: distance, y: 0 },
          source: { x: 0, y: 0 }
        });
        
        expect(gain).toBeGreaterThanOrEqual(expectedMin);
        expect(gain).toBeLessThanOrEqual(expectedMax);
      });
    });

    test('should handle floating point precision', () => {
      const gain1 = calculateGainFromDistanceToSource({
        client: { x: 10.000001, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      const gain2 = calculateGainFromDistanceToSource({
        client: { x: 10, y: 0 },
        source: { x: 0, y: 0 }
      });
      
      // Should be nearly identical
      expect(gain1).toBeCloseTo(gain2, 5);
    });
  });
});