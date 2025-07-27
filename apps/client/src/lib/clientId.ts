import { nanoid } from "nanoid";

const CLIENT_ID_KEY = "beatsync-client-id";

let cachedClientId: string | null = null;

/**
 * Get or create a persistent client ID.
 * This function can be called from anywhere (hooks, stores, etc.)
 * and will always return the same ID for the session.
 */
export function getClientId(): string {
  // Return cached value if we already have it
  if (cachedClientId) {
    return cachedClientId;
  }

  try {
    // Check if we have an existing client ID in localStorage
    const existingClientId = localStorage.getItem(CLIENT_ID_KEY);

    if (existingClientId) {
      cachedClientId = existingClientId;
    } else {
      // Generate a new client ID and save it
      const newClientId = nanoid();
      localStorage.setItem(CLIENT_ID_KEY, newClientId);
      cachedClientId = newClientId;
    }
  } catch (error) {
    console.error(
      "Failed to access localStorage, generating non-persistent client ID:",
      error
    );
    // Fallback: Generate a new client ID but don't persist it
    // This allows the app to function, but the ID won't persist across sessions/reloads
    cachedClientId = nanoid();
  }

  return cachedClientId;
}
