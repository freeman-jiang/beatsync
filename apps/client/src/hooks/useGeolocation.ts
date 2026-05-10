"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type LocationMode = "manual" | "gps";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  isWatching: boolean;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const defaultOptions: UseGeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

/**
 * Browser geolocation hook. Returns the current lat/lng plus start/stop controls.
 * Ported from herehear/herehear/src/useGeolocation.ts with no behavioral changes.
 */
export const useGeolocation = (options: UseGeolocationOptions = defaultOptions) => {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    isWatching: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setState({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      error: null,
      isWatching: true,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    let errorMessage: string;
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = "Location permission denied. Enable location access in browser settings.";
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = "Location unavailable. Check device settings.";
        break;
      case error.TIMEOUT:
        errorMessage = "Location request timed out.";
        break;
      default:
        errorMessage = "Unknown geolocation error.";
    }
    setState((prev) => ({ ...prev, error: errorMessage, isWatching: false }));
  }, []);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((prev) => ({ ...prev, error: "Geolocation not supported.", isWatching: false }));
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    const opts = optionsRef.current;
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: opts.enableHighAccuracy ?? defaultOptions.enableHighAccuracy,
      timeout: opts.timeout ?? defaultOptions.timeout,
      maximumAge: opts.maximumAge ?? defaultOptions.maximumAge,
    });

    setState((prev) => ({ ...prev, isWatching: true, error: null }));
  }, [handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, isWatching: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  return { ...state, isSupported, startWatching, stopWatching };
};
