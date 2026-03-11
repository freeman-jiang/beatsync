import { useSyncExternalStore } from "react";
import { getClientId } from "@/lib/clientId";

// Returns null on the server, resolved clientId on the client — no hydration mismatch
const getClientSnapshot = () => getClientId();
const getServerSnapshot = () => null;
const subscribe = () => () => {}; // clientId never changes after init

export function useClientId() {
  const clientId = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return { clientId };
}
