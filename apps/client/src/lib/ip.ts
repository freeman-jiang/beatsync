import { countryCodeEmoji } from "@/lib/country/countryCode";
import { LocationSchema } from "@beatsync/shared";
import { z } from "zod";
import { getCountryName } from "./country/codeToName";

type RequiredResponse = Pick<
  z.infer<typeof LocationSchema>,
  "city" | "country" | "region" | "countryCode"
>;

export const getUserLocation = async (): Promise<
  z.infer<typeof LocationSchema>
> => {
  const locationServices = [
    getUserLocationIPAPICo,
    getUserLocationIPWhoIs,
    getUserLocationIPInfo,
    getUserLocationFreeIPAPI,
  ];

  for (const [index, service] of locationServices.entries()) {
    try {
      const response = await service();
      console.log(
        `Response ${index + 1} from ${
          service.name
        }: succeeded. Hello person from ${response.country}!`
      );
      return {
        ...response,
        country: getCountryName(response.countryCode) || response.country,
        flagEmoji: getFlagEmojiFromCountryCode(response.countryCode),
        flagSvgURL: getFlagSvgURLFromCountryCode(response.countryCode),
      };
    } catch (error) {
      console.warn(`Location service ${service.name} failed:`, error);
    }
  }

  throw new Error("All IP location services failed");
};

const getFlagEmojiFromCountryCode = (countryCode: string) => {
  return countryCodeEmoji(countryCode);
};

const getFlagSvgURLFromCountryCode = (countryCode: string) => {
  if (countryCode.length !== 2) {
    throw new Error(
      `Country code must be exactly 2 characters, got: ${countryCode}`
    );
  }

  return `https://kapowaz.github.io/square-flags/flags/${countryCode.toLowerCase()}.svg`;
  // return `https://cdn.ipwhois.io/flags/${countryCode.toLowerCase()}.svg`;
};

// Zod schema for ipwho.is response based on API documentation
const IpWhoResponseSchema = z.object({
  ip: z.string(),
  success: z.boolean(),
  type: z.string(), // "IPv4" or "IPv6"
  continent: z.string(),
  continent_code: z.string(),
  country: z.string(),
  country_code: z.string(), // 2-letter ISO code
  region: z.string(),
  region_code: z.string().optional(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  is_eu: z.boolean(),
  postal: z.string().optional(),
  calling_code: z.string(),
  capital: z.string(),
  borders: z.string().optional(),
  flag: z.object({
    img: z.string(), // SVG flag URL
    emoji: z.string(), // Flag emoji
    emoji_unicode: z.string(),
  }),
  timezone: z.object({
    id: z.string(), // IANA format e.g. "America/Los_Angeles"
    abbr: z.string(),
    is_dst: z.boolean(),
    offset: z.number(),
    utc: z.string(),
    current_time: z.string(),
  }),
  message: z.string().optional(), // Only present when success is false
});

// https://ipwho.is/
const getUserLocationIPWhoIs = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://ipwho.is/");

  if (!rawResponse.ok) {
    throw new Error(
      `Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`
    );
  }

  const data = await rawResponse.json();
  console.log("Geolocation data:", data);

  // Check if it's an error response
  if (data.success === false) {
    throw new Error(`IP Geolocation Error: ${data.message || "Unknown error"}`);
  }

  // Validate and return the successful response
  const response = IpWhoResponseSchema.parse(data);
  return {
    city: response.city,
    country: response.country,
    region: response.region,
    countryCode: response.country_code,
  };
};

// https://ipapi.co/json/
const IPAPICoResponseSchema = z.object({
  city: z.string(),
  country_code: z.string(),
  country_name: z.string(),
  region: z.string(),
});
const getUserLocationIPAPICo = async (): Promise<
  z.infer<typeof LocationSchema>
> => {
  const rawResponse = await fetch("https://ipapi.co/json/");

  if (!rawResponse.ok) {
    throw new Error(
      `Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`
    );
  }

  const response = IPAPICoResponseSchema.parse(await rawResponse.json());

  return {
    flagEmoji: getFlagEmojiFromCountryCode(response.country_code),
    flagSvgURL: getFlagSvgURLFromCountryCode(response.country_code),
    city: response.city,
    country: response.country_name,
    region: response.region,
    countryCode: response.country_code,
  };
};

// https://free.freeipapi.com/api/json
const FreeIPAPIResponseSchema = z.object({
  countryName: z.string(),
  countryCode: z.string(),
  regionName: z.string(),
  cityName: z.string(),
});

const getUserLocationFreeIPAPI = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://free.freeipapi.com/api/json");

  if (!rawResponse.ok) {
    throw new Error(
      `Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`
    );
  }

  const response = FreeIPAPIResponseSchema.parse(await rawResponse.json());

  return {
    city: response.cityName,
    country: response.countryName,
    region: response.regionName,
    countryCode: response.countryCode,
  };
};

// https://ipinfo.io/json
const IPInfoResponseSchema = z.object({
  city: z.string(),
  region: z.string(),
  country: z.string(),
});

const getUserLocationIPInfo = async (): Promise<RequiredResponse> => {
  const rawResponse = await fetch("https://ipinfo.io/json");

  if (!rawResponse.ok) {
    throw new Error(
      `Failed to fetch geolocation: ${rawResponse.status} ${rawResponse.statusText}`
    );
  }

  const response = IPInfoResponseSchema.parse(await rawResponse.json());

  return {
    city: response.city,
    country: response.country,
    region: response.region,
    countryCode: response.country, // IPInfo returns 2-letter country code in 'country' field
  };
};
