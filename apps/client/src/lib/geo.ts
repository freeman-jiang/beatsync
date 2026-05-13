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
 *
 * Still exposed for non-audio uses (e.g. focusing the camera on a shape). Audio
 * proximity no longer uses centroid distance — see proximityGainForShape below.
 */
export function shapeCentroid(shape: ShapeType): GeoPositionType | undefined {
  const coords = shape.coordinates as unknown;

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

  const ring = extractPolygonRing(coords);
  if (ring && ring.length > 0) {
    let latSum = 0;
    let lngSum = 0;
    for (const pt of ring) {
      latSum += pt.lat;
      lngSum += pt.lng;
    }
    return { lat: latSum / ring.length, lng: lngSum / ring.length };
  }

  return undefined;
}

// ── Polygon parsing ───────────────────────────────────────────────────
// Leaflet's polygon coordinates can arrive as either number[][] (Beatsync's
// normalized form) or LatLng[][] (when first drawn). Normalize to a single
// GeoPositionType[] for math.
function extractPolygonRing(coords: unknown): GeoPositionType[] | undefined {
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return undefined;
  const ring = coords[0] as unknown[];
  const out: GeoPositionType[] = [];
  for (const pt of ring) {
    if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
      out.push({ lat: pt[0], lng: pt[1] });
    } else if (
      pt &&
      typeof pt === "object" &&
      "lat" in pt &&
      "lng" in pt &&
      typeof (pt as { lat: unknown }).lat === "number" &&
      typeof (pt as { lng: unknown }).lng === "number"
    ) {
      out.push({ lat: (pt as { lat: number }).lat, lng: (pt as { lng: number }).lng });
    }
  }
  return out.length >= 3 ? out : undefined;
}

function extractCircle(coords: unknown): { center: GeoPositionType; radius: number } | undefined {
  if (
    coords &&
    typeof coords === "object" &&
    "center" in coords &&
    "radius" in coords &&
    Array.isArray((coords as { center: unknown }).center) &&
    typeof (coords as { radius: unknown }).radius === "number"
  ) {
    const center = (coords as { center: [number, number] }).center;
    if (typeof center[0] === "number" && typeof center[1] === "number") {
      return { center: { lat: center[0], lng: center[1] }, radius: (coords as { radius: number }).radius };
    }
  }
  return undefined;
}

// ── Local tangent-plane projection ────────────────────────────────────
// At map scales (zones in the 10s–100s of meters), projecting lat/lng to a
// local equirectangular plane (meters east, meters north) relative to a
// reference point gives us euclidean geometry with sub-meter error. Math like
// "distance from point to line segment" or "point in polygon" is much cleaner
// in meters than on the sphere, and the error is negligible for our use case.
function toLocalMeters(ref: GeoPositionType, p: GeoPositionType): { x: number; y: number } {
  const latRef = (ref.lat * Math.PI) / 180;
  const x = (((p.lng - ref.lng) * Math.PI) / 180) * EARTH_RADIUS_METERS * Math.cos(latRef);
  const y = (((p.lat - ref.lat) * Math.PI) / 180) * EARTH_RADIUS_METERS;
  return { x, y };
}

// ── Point-in-polygon (ray casting) ─────────────────────────────────────
function pointInPolygonLocal(p: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Distance from a point to a line segment (in local meters) ──────────
function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * True if the listener is inside the shape's boundary. Inside the shape always
 * receives full volume regardless of the falloff setting.
 */
export function isInsideShape(listener: GeoPositionType, shape: ShapeType): boolean {
  const coords = shape.coordinates as unknown;
  const circle = extractCircle(coords);
  if (circle) {
    return haversineMeters(listener, circle.center) <= circle.radius;
  }
  const ring = extractPolygonRing(coords);
  if (ring) {
    const ref = ring[0];
    const ringLocal = ring.map((pt) => toLocalMeters(ref, pt));
    return pointInPolygonLocal(toLocalMeters(ref, listener), ringLocal);
  }
  return false;
}

/**
 * Distance in meters from the listener to the nearest edge of the shape.
 * Returns 0 when the listener is inside the shape.
 */
export function distanceToShapeEdgeMeters(listener: GeoPositionType, shape: ShapeType): number {
  const coords = shape.coordinates as unknown;
  const circle = extractCircle(coords);
  if (circle) {
    const dist = haversineMeters(listener, circle.center);
    return Math.max(0, dist - circle.radius);
  }
  const ring = extractPolygonRing(coords);
  if (ring) {
    const ref = ring[0];
    const ringLocal = ring.map((pt) => toLocalMeters(ref, pt));
    const pLocal = toLocalMeters(ref, listener);
    if (pointInPolygonLocal(pLocal, ringLocal)) return 0;
    let best = Infinity;
    for (let i = 0, j = ringLocal.length - 1; i < ringLocal.length; j = i++) {
      const d = distancePointToSegment(pLocal, ringLocal[j], ringLocal[i]);
      if (d < best) best = d;
    }
    return best;
  }
  return Infinity;
}

/**
 * Offset a polygon ring outward by `offsetMeters`. Each vertex moves along the
 * angle bisector of its two adjacent edges by exactly the distance needed for
 * the new edges to sit `offsetMeters` away from the originals. Works correctly
 * for convex polygons and most mildly-concave ones; pathological geometry can
 * self-intersect (acceptable for our use — user-drawn zones are typically
 * convex or near-convex).
 *
 * Used by the falloff-halo render: drawing the offset polygon at the falloff
 * distance gives a visible outline of "where audio fades to silent."
 */
export function outwardOffsetPolygonRing(ring: GeoPositionType[], offsetMeters: number): GeoPositionType[] {
  if (ring.length < 3 || offsetMeters <= 0) return ring;

  const ref = ring[0];
  const refLatRad = (ref.lat * Math.PI) / 180;
  const local = ring.map((p) => toLocalMeters(ref, p));

  // Signed area determines winding (positive == CCW in our local +x-east, +y-north plane).
  let area = 0;
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length;
    area += local[i].x * local[j].y - local[j].x * local[i].y;
  }
  const ccw = area > 0;

  // Outward unit normal for each edge i → i+1.
  const edgeNormals = local.map((p, i) => {
    const next = local[(i + 1) % local.length];
    let dx = next.x - p.x;
    let dy = next.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 0 };
    dx /= len;
    dy /= len;
    // For CCW polygons the outward perpendicular of (dx, dy) is (dy, -dx);
    // for CW it's the opposite sign.
    return ccw ? { x: dy, y: -dx } : { x: -dy, y: dx };
  });

  // Offset each vertex along the bisector of its two adjacent edge normals.
  // Standard formula: V' = V + d * (n_a + n_b) / (1 + n_a · n_b).
  const offsetLocal = local.map((p, i) => {
    const n_a = edgeNormals[(i - 1 + local.length) % local.length];
    const n_b = edgeNormals[i];
    const dot = n_a.x * n_b.x + n_a.y * n_b.y;
    const denom = 1 + dot;
    if (Math.abs(denom) < 0.01) {
      // Edges anti-parallel (180° spike) — fall back to extending along n_a.
      return { x: p.x + offsetMeters * n_a.x, y: p.y + offsetMeters * n_a.y };
    }
    const bx = (n_a.x + n_b.x) / denom;
    const by = (n_a.y + n_b.y) / denom;
    return { x: p.x + offsetMeters * bx, y: p.y + offsetMeters * by };
  });

  // Project back from local meters to lat/lng.
  return offsetLocal.map((p) => ({
    lat: ref.lat + ((p.y / EARTH_RADIUS_METERS) * 180) / Math.PI,
    lng: ref.lng + ((p.x / (EARTH_RADIUS_METERS * Math.cos(refLatRad))) * 180) / Math.PI,
  }));
}

/** Read a shape's polygon ring (normalized [lat, lng] tuples), or undefined if it isn't a polygon. */
export function getShapePolygonRing(shape: ShapeType): GeoPositionType[] | undefined {
  return extractPolygonRing(shape.coordinates);
}

/** Read a shape's circle (center + radius), or undefined if it isn't a circle. */
export function getShapeCircle(shape: ShapeType): { center: GeoPositionType; radius: number } | undefined {
  return extractCircle(shape.coordinates);
}

/**
 * Compute proximity gain (0..1) for a single shape given the listener's position.
 *
 *   - Inside the shape → 1.0 (full volume).
 *   - Outside → linear fade from 1.0 at the edge to 0.0 at `falloffMeters` past
 *     the edge.
 *   - falloffMeters === 0 → hard cutoff at the boundary.
 */
export function proximityGainForShape(listener: GeoPositionType, shape: ShapeType): number {
  if (isInsideShape(listener, shape)) return 1;
  const distance = distanceToShapeEdgeMeters(listener, shape);
  const falloff = shape.falloffMeters;
  if (falloff <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / falloff));
}
