import { useCallback, useRef } from "react";
import { useGlobalStore } from "@/store/global";

const CONNECTION_TIMEOUT_MS = 5000;

interface UseWebSocketReconnectionProps {
  maxAttempts?: number;
  initialInterval?: number;
  maxInterval?: number;
  onMaxAttemptsReached?: () => void;
  createConnection: () => void;
}

export const useWebSocketReconnection = ({
  maxAttempts = 15,
  initialInterval = 1000,
  maxInterval = 10000,
  onMaxAttemptsReached,
  createConnection,
}: UseWebSocketReconnectionProps) => {
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeout.current) {
      clearTimeout(connectionTimeout.current);
      connectionTimeout.current = null;
    }
  }, []);

  // Clear any pending reconnection timeout
  const clearReconnectionTimeout = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);

  // Reset state on successful connection
  const onConnectionOpen = () => {
    reconnectAttempts.current = 0;
    clearReconnectionTimeout();
    clearConnectionTimeout();

    // Clear reconnection state
    useGlobalStore.getState().setReconnectionInfo({
      isReconnecting: false,
      currentAttempt: 0,
      maxAttempts,
    });
  };

  // Schedule a reconnection attempt with exponential backoff
  const scheduleReconnection = () => {
    clearConnectionTimeout();
    reconnectAttempts.current++;
    useGlobalStore.getState().setReconnectionInfo({
      isReconnecting: true,
      currentAttempt: reconnectAttempts.current,
      maxAttempts,
    });

    // Check if we've exceeded max reconnection attempts
    if (reconnectAttempts.current >= maxAttempts) {
      onMaxAttemptsReached?.();
      return;
    }

    // Calculate backoff delay (exponential backoff with jitter)
    const baseDelay = Math.min(initialInterval * Math.pow(1.1, reconnectAttempts.current - 1), maxInterval);
    // eslint-disable-next-line react-hooks/purity -- only called from event handlers/timeouts, never during render
    const jitter = Math.random() * 0.15 * baseDelay;
    const delay = baseDelay + jitter;

    console.log(`Scheduling reconnection attempt ${reconnectAttempts.current} in ${delay}ms`);

    // Schedule reconnection with delay
    reconnectTimeout.current = setTimeout(() => {
      createConnection();

      // Safari/iOS can silently drop WebSocket connections without firing
      // onclose when the server is unreachable. Set a timeout to detect this
      // and retry instead of hanging forever.
      connectionTimeout.current = setTimeout(() => {
        const socket = useGlobalStore.getState().socket;
        if (socket && socket.readyState !== WebSocket.OPEN) {
          console.log("Connection timeout — server unreachable, retrying");
          socket.onclose = () => {};
          socket.close();
          scheduleReconnection();
        }
      }, CONNECTION_TIMEOUT_MS);
    }, delay);
  };

  // Reconnect immediately in response to a wake event (tab became visible,
  // network came back online). These are event-driven and fire even in
  // backgrounded tabs where the backoff timers above are throttled.
  const reconnectNow = () => {
    const socket = useGlobalStore.getState().socket;
    // Never connected yet (initial mount handles that), or already connected/connecting
    if (!socket || socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Wake events come from a present user — restart the attempt budget
    reconnectAttempts.current = 0;
    clearReconnectionTimeout();
    clearConnectionTimeout();
    createConnection();
  };

  // Cleanup function to be called on unmount
  const cleanup = useCallback(() => {
    clearReconnectionTimeout();
    clearConnectionTimeout();
  }, [clearReconnectionTimeout, clearConnectionTimeout]);

  return {
    onConnectionOpen,
    scheduleReconnection,
    reconnectNow,
    cleanup,
  };
};
