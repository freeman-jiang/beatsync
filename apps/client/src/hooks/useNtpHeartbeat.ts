import { useCallback, useEffect, useRef } from "react";
import { useGlobalStore, MAX_NTP_MEASUREMENTS } from "@/store/global";

// NTP scheduling constants
const INITIAL_NTP_INTERVAL = 30; // ms
const STEADY_STATE_NTP_INTERVAL = 5000; // 5 seconds
const NTP_RESPONSE_TIMEOUT = 15000; // 15 seconds

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

    // Check if we have a pending request that timed out
    if (
      lastNtpRequestTime.current &&
      Date.now() - lastNtpRequestTime.current > NTP_RESPONSE_TIMEOUT
    ) {
      console.error("NTP request timed out - connection may be stale");
      // Notify parent component that connection is stale
      onConnectionStale?.();
      return;
    }

    // Determine interval based on whether we have initial measurements
    const currentMeasurements = useGlobalStore.getState().ntpMeasurements;
    const interval =
      currentMeasurements.length < MAX_NTP_MEASUREMENTS
        ? INITIAL_NTP_INTERVAL
        : STEADY_STATE_NTP_INTERVAL;

    ntpTimerRef.current = window.setTimeout(() => {
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
