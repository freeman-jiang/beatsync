export const R2_AUDIO_FILE_NAME_DELIMITER = "___";

const STEADY_STATE_INTERVAL_MS = 2500;

// NTP Heartbeat Constants
export const NTP_CONSTANTS = {
  // Initial interval for rapid measurement collection
  INITIAL_INTERVAL_MS: 30,
  // Steady state interval after initial measurements
  STEADY_STATE_INTERVAL_MS: STEADY_STATE_INTERVAL_MS,
  // Timeout before considering connection stale
  // Increased to 12x (30s) to prevent disconnects during file picker selection or slow network (Issue #93)
  RESPONSE_TIMEOUT_MS: 12 * STEADY_STATE_INTERVAL_MS,
  // Maximum number of NTP measurements to collect initially
  MAX_MEASUREMENTS: 40,
} as const;

export const CHAT_CONSTANTS = {
  MAX_MESSAGE_LENGTH: 20_000,
} as const;
