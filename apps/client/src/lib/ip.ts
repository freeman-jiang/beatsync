import { countryCodeEmoji } from "@/lib/country/countryCode";
import { LocationSchema } from "@beatsync/shared";
import { z } from "zod";
import { getCountryName } from "./country/codeToName";

type RequiredResponse = Pick<z.infer<typeof LocationSchema>, "city" | "country" | "region" | "countryCode">;

const FETCH_TIMEOUT_MS = 5000;

let cachedLocation: z.infer<typeof LocationSchema> | null = null;

export const getUserLocation = async (): Promise<z.infer<typeof LocationSchema>> => {
  if (cachedLocation) {
    return cachedLocation;
  }

  const locationServices = [
    getUserLocationGeoJS,
    getUserLocationIPAPICo,
    getUserLocationCountryIs,
    getUserLocationKameroGeo,
    getUserLocationIPWhoIs,
  ];

  for (const [index, service] of locationServices.entries()) {
    try {
      const response = await service();
      console.log(`Response ${index + 1} from ${service.name}: succeeded. Hello person from ${response.country}!`);
      const location = {
        ...response,
        country: getCountryName(response.countryCode) || response.country,
        flagEmoji: countryCodeEmoji(response.countryCode),
        flagSvgURL: getFlagSvgURLFromCountryCode(response.countryCode),
      };
      cachedLocation = location;
      return location;
    } catch (error) {
      console.warn(`Location service ${service.name} failed:`, error);
    }
  }

  throw new Error("All IP location services failed");
};

const getFlagSvgURLFromCountryCode = (countryCode: string) => {
  if (countryCode.length !== 2) {
    throw new Error(`Country code must be exactly 2 characters, got: ${countryCode}`);
  }

  return `/flags/${countryCode.toLowerCase()}.svg`;
};

// https://country.is — MaxMind-backed, CORS, 10 req/sec, commercial OK
const CountryIsResponseSchema = z.object({
  ip: z.string(),
  country: z.string(),
  city: z.string().optional(),
  subdivision: z.string().optional(),
});

const getUserLocationCountryIs = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://api.country.is/?fields=city,subdivision", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`);
  }

  const response = CountryIsResponseSchema.parse(await rawResponse.json());

  return {
    city: response.city ?? "",
    country: response.country,
    region: response.subdivision ?? "",
    countryCode: response.country,
  };
};

// https://www.geojs.io — Cloudflare-backed, full CORS, no key, unlimited
const GeoJSResponseSchema = z.object({
  country_code: z.string(),
  country: z.string(),
  city: z.string().optional(),
  region: z.string().optional(),
});

const getUserLocationGeoJS = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://get.geojs.io/v1/ip/geo.json", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`);
  }

  const response = GeoJSResponseSchema.parse(await rawResponse.json());

  return {
    city: response.city ?? "",
    country: response.country,
    region: response.region ?? "",
    countryCode: response.country_code,
  };
};

// https://geo.kamero.ai — Vercel Edge, CORS, no key, free
const KameroGeoResponseSchema = z.object({
  country: z.string(),
  city: z.string().optional(),
  countryRegion: z.string().optional(),
});

const getUserLocationKameroGeo = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://geo.kamero.ai/api/geo", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`);
  }

  const response = KameroGeoResponseSchema.parse(await rawResponse.json());

  return {
    city: response.city ?? "",
    country: response.country,
    region: response.countryRegion ?? "",
    countryCode: response.country,
  };
};

// https://ipapi.co/json/ — rate-limited (429) under load
const IPAPICoResponseSchema = z.object({
  city: z.string(),
  country_code: z.string(),
  country_name: z.string(),
  region: z.string(),
});

const getUserLocationIPAPICo = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://ipapi.co/json/", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`);
  }

  const response = IPAPICoResponseSchema.parse(await rawResponse.json());

  return {
    city: response.city,
    country: response.country_name,
    region: response.region,
    countryCode: response.country_code,
  };
};

// https://ipwho.is/ — returning 403 in production, kept as last resort
const IpWhoIsResponseSchema = z
  .object({
    success: z.boolean(),
    country: z.string(),
    country_code: z.string(),
    region: z.string(),
    city: z.string(),
    message: z.string().optional(),
  })
  .passthrough();

const getUserLocationIPWhoIs = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://ipwho.is/", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`);
  }

  const data = await rawResponse.json();

  if (data.success === false) {
    throw new Error(`IP Geolocation Error: ${data.message || "Unknown error"}`);
  }

  const response = IpWhoIsResponseSchema.parse(data);
  return {
    city: response.city,
    country: response.country,
    region: response.region,
    countryCode: response.country_code,
  };
};
