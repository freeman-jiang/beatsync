import { z } from "zod";
import { LocationSchema } from "./types/WSRequest";

type LocationFields = Pick<z.infer<typeof LocationSchema>, "city" | "country" | "region">;

/**
 * Returns true if a value looks like a real place name (not a numeric code like "01", "00").
 */
export const isValidPlaceName = (value: string): boolean => {
  if (!value) return false;
  return !/^\d+$/.test(value);
};

/**
 * Strips numeric-only city/region values, returning them as empty strings.
 */
export const sanitizeLocationFields = <T extends LocationFields>(location: T): T => ({
  ...location,
  city: isValidPlaceName(location.city) ? location.city : "",
  region: isValidPlaceName(location.region) ? location.region : "",
});

/**
 * Scores a location response by how many useful fields it has (0-3).
 * Higher = better. countryCode is assumed always present so not scored.
 */
export const scoreLocationQuality = (location: LocationFields): number => {
  let score = 0;
  // country is checked with truthiness only — providers always return a non-numeric country name
  if (location.country) score++;
  if (isValidPlaceName(location.city)) score++;
  if (isValidPlaceName(location.region)) score++;
  return score;
};

export const MAX_LOCATION_QUALITY = scoreLocationQuality({ city: "x", region: "x", country: "x" });
