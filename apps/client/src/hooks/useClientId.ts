import { useEffect, useState } from "react";
import { getClientId } from "@/lib/clientId";

export function useClientId() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    // Get the client ID using the shared logic
    const id = getClientId();
    setClientId(id);
  }, []);

  return { clientId };
}
