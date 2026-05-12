// Pure-function tests for the map-room geometry helpers.

import type { ShapeType } from "@beatsync/shared";
import { describe, expect, it } from "bun:test";
import { haversineMeters, proximityGainForShape, shapeCentroid, shapeRadiusMeters } from "@/lib/geo";

function poly(coords: [number, number][]): ShapeType {
  return {
    id: "p1",
    type: "polygon",
    coordinates: [coords],
    createdBy: "c",
    createdAt: 0,
    groupId: null,
    audibleRadiusMeters: 50,
  };
}

function circle(center: [number, number], radius: number, audibleRadius = 0): ShapeType {
  return {
    id: "c1",
    type: "circle",
    coordinates: { center, radius },
    createdBy: "c",
    createdAt: 0,
    groupId: null,
    audibleRadiusMeters: audibleRadius,
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

  it("handles polygons specified as { lat, lng } objects", () => {
    const s: ShapeType = {
      id: "p2",
      type: "polygon",
      coordinates: [
        [
          { lat: 0, lng: 0 },
          { lat: 4, lng: 0 },
          { lat: 0, lng: 4 },
        ],
      ],
      createdBy: "c",
      createdAt: 0,
      groupId: null,
      audibleRadiusMeters: 50,
    };
    const centroid = shapeCentroid(s);
    expect(centroid?.lat).toBeCloseTo(4 / 3, 5);
    expect(centroid?.lng).toBeCloseTo(4 / 3, 5);
  });

  it("returns undefined for unknown coordinate shapes", () => {
    const broken: ShapeType = {
      id: "x",
      type: "polygon",
      coordinates: { junk: true },
      createdBy: "c",
      createdAt: 0,
      groupId: null,
      audibleRadiusMeters: 50,
    };
    expect(shapeCentroid(broken)).toBeUndefined();
  });
});

describe("shapeRadiusMeters", () => {
  it("returns the drawn radius for circles (when larger than audibleRadiusMeters)", () => {
    expect(shapeRadiusMeters(circle([0, 0], 200, 50))).toBe(200);
  });

  it("falls back to audibleRadiusMeters for non-circle shapes", () => {
    expect(
      shapeRadiusMeters(
        poly([
          [0, 0],
          [0, 1],
        ])
      )
    ).toBe(50);
  });
});

describe("proximityGainForShape", () => {
  it("returns 1 when listener is at the centroid", () => {
    const s = circle([42.28, -83.74], 100);
    expect(proximityGainForShape({ lat: 42.28, lng: -83.74 }, s)).toBeCloseTo(1, 5);
  });

  it("returns 0 outside the audible radius", () => {
    const s = circle([0, 0], 50);
    // 1 degree latitude is ~111km — well outside 50m
    expect(proximityGainForShape({ lat: 1, lng: 0 }, s)).toBe(0);
  });

  it("ramps linearly between centroid and radius", () => {
    const s = circle([0, 0], 100);
    // Move just under 50m north of (0,0)
    const fortyMeters = { lat: 40 / 111_320, lng: 0 };
    const gain = proximityGainForShape(fortyMeters, s);
    expect(gain).toBeGreaterThan(0.5);
    expect(gain).toBeLessThan(0.7);
  });
});
