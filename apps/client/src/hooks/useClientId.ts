import { nanoid } from "nanoid";
import { useEffect, useState } from "react";

const CLIENT_ID_KEY = "beatsync-client-id";

export function useClientId() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    let idToUse: string | null = null;
    try {
      // Check if we have an existing client ID in localStorage
      const existingClientId = localStorage.getItem(CLIENT_ID_KEY);

      if (existingClientId) {
        idToUse = existingClientId;
      } else {
        // Generate a new client ID and save it
        const newClientId = nanoid();
        localStorage.setItem(CLIENT_ID_KEY, newClientId);
        idToUse = newClientId;
      }
    } catch (error) {
      console.error("Failed to access localStorage, generating non-persistent client ID:", error);
      // Fallback: Generate a new client ID but don't persist it
      // This allows the app to function, but the ID won't persist across sessions/reloads
      idToUse = nanoid();
    } finally {
      setClientId(idToUse);
    }
  }, []);

  return { clientId };
}
