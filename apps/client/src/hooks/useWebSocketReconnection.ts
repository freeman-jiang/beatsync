import { useCallback, useRef } from "react";
import { toast } from "sonner";

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
  const onConnectionOpen = useCallback(() => {
    reconnectAttempts.current = 0;
    clearReconnectionTimeout();
  }, [clearReconnectionTimeout]);

  // Schedule a reconnection attempt with exponential backoff
  const scheduleReconnection = useCallback(() => {
    // Check if we've exceeded max reconnection attempts
    if (reconnectAttempts.current >= maxAttempts) {
      toast.error(
        `Failed to reconnect after ${maxAttempts} attempts. Please refresh the page.`
      );
      console.error("Max reconnection attempts reached");
      onMaxAttemptsReached?.();
      return;
    }

    reconnectAttempts.current++;

    // Calculate backoff delay (exponential backoff with jitter)
    const baseDelay = Math.min(
      initialInterval * Math.pow(2, reconnectAttempts.current - 1),
      maxInterval
    );
    const jitter = Math.random() * 0.15 * baseDelay; // 15% jitter
    const delay = baseDelay + jitter;

    toast.error(
      `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (${
        reconnectAttempts.current
      }/${maxAttempts})`
    );
    console.log(
      `Scheduling reconnection attempt ${reconnectAttempts.current} in ${delay}ms`
    );

    // Schedule reconnection with delay
    reconnectTimeout.current = setTimeout(() => {
      createConnection();
    }, delay);
  }, [
    maxAttempts,
    initialInterval,
    maxInterval,
    createConnection,
    onMaxAttemptsReached,
  ]);

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
