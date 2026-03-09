import { describe, expect, test } from "bun:test";
import { isValidPlaceName, MAX_LOCATION_QUALITY, sanitizeLocationFields, scoreLocationQuality } from "@beatsync/shared";

describe("isValidPlaceName", () => {
  test("rejects purely numeric codes", () => {
    expect(isValidPlaceName("00")).toBe(false);
    expect(isValidPlaceName("01")).toBe(false);
    expect(isValidPlaceName("123")).toBe(false);
    expect(isValidPlaceName("0")).toBe(false);
  });

  test("rejects empty strings", () => {
    expect(isValidPlaceName("")).toBe(false);
  });

  test("accepts real place names", () => {
    expect(isValidPlaceName("Santo Domingo")).toBe(true);
    expect(isValidPlaceName("Ontario")).toBe(true);
    expect(isValidPlaceName("New York")).toBe(true);
    expect(isValidPlaceName("São Paulo")).toBe(true);
  });

  test("accepts place names containing digits", () => {
    expect(isValidPlaceName("District 9")).toBe(true);
    expect(isValidPlaceName("Region 4A")).toBe(true);
  });
});

describe("scoreLocationQuality", () => {
  test("scores full response as max quality", () => {
    expect(
      scoreLocationQuality({
        city: "Manila",
        region: "Metro Manila",
        country: "Philippines",
      })
    ).toBe(MAX_LOCATION_QUALITY);
  });

  test("scores numeric region lower than named region", () => {
    const withNumericRegion = scoreLocationQuality({
      city: "Mandaluyong",
      region: "00",
      country: "Philippines",
    });
    const withNamedRegion = scoreLocationQuality({
      city: "Mandaluyong",
      region: "Metro Manila",
      country: "Philippines",
    });
    expect(withNumericRegion).toBeLessThan(withNamedRegion);
  });
});

describe("sanitizeLocationFields", () => {
  test("clears numeric region codes", () => {
    const result = sanitizeLocationFields({
      city: "Santo Domingo",
      region: "01",
      country: "Dominican Republic",
    });
    expect(result.region).toBe("");
    expect(result.city).toBe("Santo Domingo");
    expect(result.country).toBe("Dominican Republic");
  });

  test("clears numeric city codes", () => {
    const result = sanitizeLocationFields({
      city: "00",
      region: "Metro Manila",
      country: "Philippines",
    });
    expect(result.city).toBe("");
    expect(result.region).toBe("Metro Manila");
  });

  test("preserves extra fields on the object", () => {
    const input = {
      city: "00",
      region: "01",
      country: "PH",
      countryCode: "PH",
      flagEmoji: "🇵🇭",
      flagSvgURL: "/flags/ph.svg",
    };
    const result = sanitizeLocationFields(input);
    expect(result.countryCode).toBe("PH");
    expect(result.flagEmoji).toBe("🇵🇭");
    expect(result.flagSvgURL).toBe("/flags/ph.svg");
    expect(result.city).toBe("");
    expect(result.region).toBe("");
  });
});
