import { useCallback, useEffect, useRef } from "react";
import { useGlobalStore, MAX_NTP_MEASUREMENTS } from "@/store/global";
import { NTP_CONSTANTS } from "@beatsync/shared";

interface UseNtpHeartbeatProps {
  onConnectionStale?: () => void;
}

export const useNtpHeartbeat = ({
  onConnectionStale,
}: UseNtpHeartbeatProps) => {
  const ntpTimerRef = useRef<number | null>(null);
  const lastNtpRequestTime = useRef<number | null>(null);
  const sendNTPRequest = useGlobalStore((state) => state.sendNTPRequest);

  // Schedule next NTP request
  const scheduleNextNtpRequest = useCallback(() => {
    // Cancel any existing timeout
    if (ntpTimerRef.current) {
      clearTimeout(ntpTimerRef.current);
    }

    // Determine interval based on whether we have initial measurements
    const currentMeasurements = useGlobalStore.getState().ntpMeasurements;
    const interval =
      currentMeasurements.length < MAX_NTP_MEASUREMENTS
        ? NTP_CONSTANTS.INITIAL_INTERVAL_MS
        : NTP_CONSTANTS.STEADY_STATE_INTERVAL_MS;

    ntpTimerRef.current = window.setTimeout(() => {
      // Check if we have a pending request that timed out BEFORE resetting timer
      if (
        lastNtpRequestTime.current &&
        Date.now() - lastNtpRequestTime.current >
          NTP_CONSTANTS.RESPONSE_TIMEOUT_MS
      ) {
        console.error("NTP request timed out - connection may be stale");
        // Notify parent component that connection is stale
        onConnectionStale?.();
        return; // Don't send another request or schedule next
      }

      // Only reset timer and send request if the previous one didn't timeout
      lastNtpRequestTime.current = Date.now();
      sendNTPRequest();
      scheduleNextNtpRequest(); // Schedule the next one
    }, interval);
  }, [sendNTPRequest, onConnectionStale]);

  // Start the heartbeat when socket opens
  const startHeartbeat = useCallback(() => {
    scheduleNextNtpRequest();
  }, [scheduleNextNtpRequest]);

  // Stop the heartbeat
  const stopHeartbeat = useCallback(() => {
    if (ntpTimerRef.current) {
      clearTimeout(ntpTimerRef.current);
      ntpTimerRef.current = null;
    }
    lastNtpRequestTime.current = null;
  }, []);

  // Mark that we received an NTP response
  const markNTPResponseReceived = useCallback(() => {
    lastNtpRequestTime.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHeartbeat();
    };
  }, [stopHeartbeat]);

  return {
    startHeartbeat,
    stopHeartbeat,
    markNTPResponseReceived,
  };
};
