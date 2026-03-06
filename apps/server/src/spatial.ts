import type { PositionType } from "@beatsync/shared/types/basic";

function calculateEuclideanDistance(p1: PositionType, p2: PositionType): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface GainParams {
  client: PositionType;
  source: PositionType;
  falloff?: number;
  minGain?: number;
  maxGain?: number;
}

export const calculateGainFromDistanceToSource = (params: GainParams) => {
  return gainFromDistanceQuadratic(params);
};

export function gainFromDistanceExp({
  client,
  source,
  falloff = 0.05,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain * Math.exp(-falloff * distance);
  return Math.max(minGain, gain);
}

export function gainFromDistanceLinear({
  client,
  source,
  falloff = 0.01,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  // Linear falloff: gain decreases linearly with distance
  const gain = maxGain - falloff * distance;
  return Math.max(minGain, gain);
}

export function gainFromDistanceQuadratic({
  client,
  source,
  falloff = 0.001,
  minGain = 0.15,
  maxGain = 1.0,
}: GainParams): number {
  const distance = calculateEuclideanDistance(client, source);
  // Quadratic falloff: gain decreases with square of distance
  const gain = maxGain - falloff * distance * distance;
  return Math.max(minGain, gain);
}
