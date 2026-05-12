// Geographic helpers used by map rooms. Pure functions — no Leaflet dependency so they
// can be unit-tested without a DOM.

import type { GeoPositionType, ShapeType } from "@beatsync/shared";

const EARTH_RADIUS_METERS = 6371000;

/** Great-circle distance between two geo points (meters). */
export function haversineMeters(a: GeoPositionType, b: GeoPositionType): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Best-effort centroid of a shape's geometry. Shape coordinates are stored as `unknown`
 * because the structure varies between Leaflet draw types — this function inspects the
 * runtime shape and returns the centroid (polygons), center (circles), or undefined.
 */
export function shapeCentroid(shape: ShapeType): GeoPositionType | undefined {
  const coords = shape.coordinates as unknown;

  // Circle / circle-marker: { center: [lat, lng], radius }
  if (
    coords &&
    typeof coords === "object" &&
    "center" in coords &&
    Array.isArray((coords as { center: unknown }).center)
  ) {
    const center = (coords as { center: [number, number] }).center;
    if (typeof center[0] === "number" && typeof center[1] === "number") {
      return { lat: center[0], lng: center[1] };
    }
  }

  // Polygon / rectangle: LatLng[][] (outer ring + holes). We average the outer ring.
  if (Array.isArray(coords) && Array.isArray(coords[0])) {
    const ring = coords[0] as unknown[];
    let latSum = 0;
    let lngSum = 0;
    let n = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
        latSum += pt[0];
        lngSum += pt[1];
        n++;
      } else if (
        pt &&
        typeof pt === "object" &&
        "lat" in pt &&
        "lng" in pt &&
        typeof (pt as { lat: unknown }).lat === "number" &&
        typeof (pt as { lng: unknown }).lng === "number"
      ) {
        latSum += (pt as { lat: number }).lat;
        lngSum += (pt as { lng: number }).lng;
        n++;
      }
    }
    if (n > 0) return { lat: latSum / n, lng: lngSum / n };
  }

  return undefined;
}

/** Effective "radius" of a shape — the distance at which gain reaches 0. */
export function shapeRadiusMeters(shape: ShapeType): number {
  const coords = shape.coordinates as unknown;
  // Circle's drawn radius takes precedence over the curator-tunable audibleRadiusMeters.
  if (
    coords &&
    typeof coords === "object" &&
    "radius" in coords &&
    typeof (coords as { radius: unknown }).radius === "number"
  ) {
    return Math.max(shape.audibleRadiusMeters, (coords as { radius: number }).radius);
  }
  return shape.audibleRadiusMeters;
}

/**
 * Compute proximity gain (0..1) for a single shape given the listener's position.
 * Linear falloff from 1.0 at the centroid to 0.0 at the shape's audible radius.
 */
export function proximityGainForShape(listener: GeoPositionType, shape: ShapeType): number {
  const centroid = shapeCentroid(shape);
  if (!centroid) return 0;
  const distance = haversineMeters(listener, centroid);
  const radius = shapeRadiusMeters(shape);
  if (radius <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / radius));
}
