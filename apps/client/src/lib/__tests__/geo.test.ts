// Pure-function tests for the map-room geometry helpers.

import type { ShapeType } from "@beatsync/shared";
import { describe, expect, it } from "bun:test";
import {
  distanceToShapeEdgeMeters,
  haversineMeters,
  isInsideShape,
  proximityGainForShape,
  shapeCentroid,
} from "@/lib/geo";

function poly(coords: [number, number][], falloff = 25): ShapeType {
  return {
    id: "p1",
    type: "polygon",
    coordinates: [coords],
    createdBy: "c",
    createdAt: 0,
    groupId: null,
    falloffMeters: falloff,
  };
}

function circle(center: [number, number], radius: number, falloff = 25): ShapeType {
  return {
    id: "c1",
    type: "circle",
    coordinates: { center, radius },
    createdBy: "c",
    createdAt: 0,
    groupId: null,
    falloffMeters: falloff,
  };
}

describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters({ lat: 42.28, lng: -83.74 }, { lat: 42.28, lng: -83.74 })).toBe(0);
  });

  it("approximates ~111km per degree of latitude", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = { lat: 42.28, lng: -83.74 };
    const b = { lat: 42.29, lng: -83.75 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe("shapeCentroid", () => {
  it("returns center for circles", () => {
    const c = shapeCentroid(circle([42.28, -83.74], 50));
    expect(c).toEqual({ lat: 42.28, lng: -83.74 });
  });

  it("returns average of polygon outer ring", () => {
    const c = shapeCentroid(
      poly([
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
      ])
    );
    expect(c?.lat).toBeCloseTo(1, 5);
    expect(c?.lng).toBeCloseTo(1, 5);
  });

  it("returns undefined for unknown coordinate shapes", () => {
    const broken: ShapeType = {
      id: "x",
      type: "polygon",
      coordinates: { junk: true },
      createdBy: "c",
      createdAt: 0,
      groupId: null,
      falloffMeters: 25,
    };
    expect(shapeCentroid(broken)).toBeUndefined();
  });
});

// A small polygon centred at (0,0) — easier reasoning for the inside/outside math.
// At the equator ~111.32km per degree of longitude → 0.001° lng ≈ 111m.
// We construct a ~100m square around (0,0) by using lat/lng offsets of ~0.00045.
const SQUARE_HALF_DEG = 0.00045; // ~50m
function smallSquare(falloff = 25): ShapeType {
  return poly(
    [
      [-SQUARE_HALF_DEG, -SQUARE_HALF_DEG],
      [-SQUARE_HALF_DEG, SQUARE_HALF_DEG],
      [SQUARE_HALF_DEG, SQUARE_HALF_DEG],
      [SQUARE_HALF_DEG, -SQUARE_HALF_DEG],
    ],
    falloff
  );
}

describe("isInsideShape", () => {
  it("returns true at the center of a circle", () => {
    expect(isInsideShape({ lat: 0, lng: 0 }, circle([0, 0], 50))).toBe(true);
  });

  it("returns true just inside the circle radius", () => {
    // ~30m north of (0,0) — inside a 50m-radius circle
    expect(isInsideShape({ lat: 30 / 111_320, lng: 0 }, circle([0, 0], 50))).toBe(true);
  });

  it("returns false just outside the circle radius", () => {
    // ~70m north of (0,0) — outside a 50m-radius circle
    expect(isInsideShape({ lat: 70 / 111_320, lng: 0 }, circle([0, 0], 50))).toBe(false);
  });

  it("returns true at the centroid of a polygon", () => {
    expect(isInsideShape({ lat: 0, lng: 0 }, smallSquare())).toBe(true);
  });

  it("returns false outside the polygon", () => {
    // 1 degree latitude is ~111km — clearly outside the ~100m square
    expect(isInsideShape({ lat: 1, lng: 0 }, smallSquare())).toBe(false);
  });
});

describe("distanceToShapeEdgeMeters", () => {
  it("returns 0 inside a shape", () => {
    expect(distanceToShapeEdgeMeters({ lat: 0, lng: 0 }, circle([0, 0], 50))).toBe(0);
    expect(distanceToShapeEdgeMeters({ lat: 0, lng: 0 }, smallSquare())).toBe(0);
  });

  it("returns positive distance outside a circle equal to dist-radius", () => {
    // ~100m from center, radius 50 → ~50m outside
    const d = distanceToShapeEdgeMeters({ lat: 100 / 111_320, lng: 0 }, circle([0, 0], 50));
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });

  it("returns near-edge distance for a polygon", () => {
    // ~50m north of the square's center; the square's edge is ~50m north of center
    const d = distanceToShapeEdgeMeters({ lat: 100 / 111_320, lng: 0 }, smallSquare());
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(60);
  });
});

describe("proximityGainForShape", () => {
  it("returns 1 anywhere inside the shape (circle)", () => {
    const c = circle([0, 0], 100, 30);
    expect(proximityGainForShape({ lat: 0, lng: 0 }, c)).toBe(1);
    // ~50m from center, well inside the 100m-radius circle
    expect(proximityGainForShape({ lat: 50 / 111_320, lng: 0 }, c)).toBe(1);
  });

  it("returns 1 anywhere inside the shape (polygon)", () => {
    expect(proximityGainForShape({ lat: 0, lng: 0 }, smallSquare())).toBe(1);
  });

  it("fades linearly from 1 at the edge to 0 past falloffMeters", () => {
    const c = circle([0, 0], 50, 50); // radius 50, falloff 50m past edge
    // 75m from center → 25m past the edge → ~0.5
    const gain = proximityGainForShape({ lat: 75 / 111_320, lng: 0 }, c);
    expect(gain).toBeGreaterThan(0.4);
    expect(gain).toBeLessThan(0.6);
  });

  it("returns 0 well past the falloff range", () => {
    const c = circle([0, 0], 50, 25);
    // ~200m from center, way past edge+falloff
    expect(proximityGainForShape({ lat: 200 / 111_320, lng: 0 }, c)).toBe(0);
  });

  it("hard cutoff when falloffMeters is 0", () => {
    const c = circle([0, 0], 50, 0);
    expect(proximityGainForShape({ lat: 0, lng: 0 }, c)).toBe(1);
    // 1m outside the edge — already 0
    expect(proximityGainForShape({ lat: 51 / 111_320, lng: 0 }, c)).toBe(0);
  });
});
