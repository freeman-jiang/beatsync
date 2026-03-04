import { useState } from "react";
import { getClientId } from "@/lib/clientId";

export function useClientId() {
  const [clientId] = useState<string | null>(() => {
    // Use lazy initializer to read from localStorage on first render
    try {
      return getClientId();
    } catch {
      return null;
    }
  });

  return { clientId };
}
