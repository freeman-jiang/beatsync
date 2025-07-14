import { useCallback, useRef } from "react";
import { useGlobalStore } from "@/store/global";

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

    // Clear reconnection state
    useGlobalStore.getState().setReconnectionInfo({
      isReconnecting: false,
      currentAttempt: 0,
      maxAttempts,
    });
  };

  // Schedule a reconnection attempt with exponential backoff
  const scheduleReconnection = () => {
    reconnectAttempts.current++;
    useGlobalStore.getState().setReconnectionInfo({
      isReconnecting: true, // Keep
      currentAttempt: reconnectAttempts.current,
      maxAttempts,
    });

    // Check if we've exceeded max reconnection attempts
    if (reconnectAttempts.current >= maxAttempts) {
      onMaxAttemptsReached?.();
      return;
    }

    // Calculate backoff delay (exponential backoff with jitter)
    const baseDelay = Math.min(
      initialInterval * Math.pow(1.1, reconnectAttempts.current - 1),
      maxInterval
    );
    const jitter = Math.random() * 0.15 * baseDelay; // 15% jitter
    const delay = baseDelay + jitter;

    console.log(
      `Scheduling reconnection attempt ${reconnectAttempts.current} in ${delay}ms`
    );

    // Schedule reconnection with delay
    reconnectTimeout.current = setTimeout(() => {
      createConnection();
    }, delay);
  };

  // Cleanup function to be called on unmount
  const cleanup = useCallback(() => {
    clearReconnectionTimeout();
  }, [clearReconnectionTimeout]);

  return {
    onConnectionOpen,
    scheduleReconnection,
    cleanup,
  };
};
