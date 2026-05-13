export const R2_AUDIO_FILE_NAME_DELIMITER = "___";

const STEADY_STATE_INTERVAL_MS = 2500;

// NTP Heartbeat Constants
export const NTP_CONSTANTS = {
  // Initial interval for rapid measurement collection
  INITIAL_INTERVAL_MS: 50,
  // Steady state interval after initial measurements
  STEADY_STATE_INTERVAL_MS: STEADY_STATE_INTERVAL_MS,
  // Timeout before considering connection stale
  RESPONSE_TIMEOUT_MS: 1.5 * STEADY_STATE_INTERVAL_MS,
  // Maximum number of NTP measurements to collect initially
  MAX_MEASUREMENTS: 16,
  // Coded probes (Huygens) — inter-departure gap between probe pairs
  // Large enough gap to avoid TCP coalescing where browsers batch small writes into one segment
  PROBE_GAP_MS: 25,
  // Coded probes — client accepts server gap within ±this tolerance
  PROBE_GAP_TOLERANCE_MS: 5,
} as const;

export const LOW_PASS_CONSTANTS = {
  MIN_FREQ: 20,
  MAX_FREQ: 20000,
} as const;

export const CHAT_CONSTANTS = {
  MAX_MESSAGE_LENGTH: 20_000,
} as const;

// Map-room defaults (geospatial silent disco).
export const MAP_CONSTANTS = {
  // Distance past the shape's edge over which audio fades from full to silent.
  // Inside the shape always plays at gain 1.0; outside falls off linearly until
  // it hits zero at falloffMeters beyond the nearest edge.
  DEFAULT_FALLOFF_METERS: 25,
  MIN_FALLOFF_METERS: 0,
  MAX_FALLOFF_METERS: 5000,
  DEFAULT_BUFFER_CACHE_SIZE: 12,
  PROXIMITY_GAIN_RAMP_SECONDS: 0.05,
  DEFAULT_MAP_CENTER: [42.2808, -83.7430] as [number, number], // Ann Arbor, MI
  DEFAULT_MAP_ZOOM: 17,
} as const;
