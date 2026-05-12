"use client";
// Root shell for map rooms. Renders the side panel, the Leaflet canvas, and a
// header with location-mode controls.

import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { audioContextManager } from "@/lib/audioContextManager";
import { proximityGainForShape } from "@/lib/geo";
import { mapAudio } from "@/lib/mapAudio";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { useRoomStore } from "@/store/room";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { MapPin, MousePointer } from "lucide-react";
import { useEffect } from "react";
import { DebugPanel } from "./DebugPanel";
import { MapCanvas, useCanMutate } from "./MapCanvas";
import { ShapePlaylistPanel } from "./ShapePlaylistPanel";

interface MapRoomProps {
  roomId: string;
}

export const MapRoom = ({ roomId }: MapRoomProps) => {
  const roomType = useRoomStore((s) => s.roomType);
  const isConnected = useGlobalStore((s) => s.socket?.readyState === WebSocket.OPEN);
  const isSynced = useGlobalStore((s) => s.isSynced);
  const offsetEstimate = useGlobalStore((s) => s.offsetEstimate);
  const probeStats = useGlobalStore((s) => s.probeStats);
  const canMutate = useCanMutate();
  const locationMode = useMapStore((s) => s.locationMode);
  const setLocationMode = useMapStore((s) => s.setLocationMode);
  const ownPosition = useMapStore((s) => s.ownPosition);
  const setOwnPosition = useMapStore((s) => s.setOwnPosition);
  const shapes = useMapStore((s) => s.shapes);
  const shapesCount = shapes.size;

  const {
    latitude,
    longitude,
    accuracy,
    error: gpsError,
    isWatching,
    isSupported,
    startWatching,
    stopWatching,
  } = useGeolocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });

  // Start/stop GPS watching based on locationMode.
  useEffect(() => {
    if (locationMode === "gps") startWatching();
    else stopWatching();
  }, [locationMode, startWatching, stopWatching]);

  // GPS → store + server.
  useEffect(() => {
    if (locationMode !== "gps") return;
    if (latitude == null || longitude == null) return;
    setOwnPosition({ lat: latitude, lng: longitude });
    const ws = useGlobalStore.getState().socket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendWSRequest({
        ws,
        request: { type: ClientActionEnum.enum.SET_GEO_POSITION, lat: latitude, lng: longitude },
      });
    }
  }, [locationMode, latitude, longitude, setOwnPosition]);

  // Compute + apply proximity gains whenever own position or shape geometry changes.
  useEffect(() => {
    if (!ownPosition) return;
    const nextGains = new Map<string, number>();
    for (const shape of shapes.values()) {
      const gain = proximityGainForShape(ownPosition, shape);
      nextGains.set(shape.id, gain);
      mapAudio.setProximityGain(shape.id, gain);
    }
    useMapStore.getState().setProximityGains(nextGains);
  }, [ownPosition, shapes]);

  // Note: deliberately NOT resetting mapAudio on unmount. Audio chains belong to the
  // WebSocket session, not the React component tree. Resetting on unmount kills audio
  // during HMR (component remounts but WS stays open), and there's no auto-recovery
  // because the server only re-sends per-shape PLAY in the initial handleOpen burst.
  // Real teardown happens when the page unloads / the WS closes.
  // TODO(post-MVP): if we support SPA navigation between rooms, reset chains when the
  // WebSocket reconnects to a different roomId.

  // Autoplay-policy unlock: browsers keep the AudioContext suspended until a real
  // user gesture. The audio-room dashboard gets one when the user hits play, but a
  // late-joining map-room visitor receives a unicast resume from the server *before*
  // any interaction — so source.start() schedules silently. Listen for the first
  // pointer/keyboard event and resume the context. Capture phase + once-per-event
  // until success, then detach.
  useEffect(() => {
    const events = ["pointerdown", "touchend", "keydown"] as const;
    const tryResume = () => {
      void audioContextManager.resume().then(() => {
        for (const evt of events) window.removeEventListener(evt, tryResume, true);
      });
    };
    for (const evt of events) {
      window.addEventListener(evt, tryResume, { capture: true, passive: true });
    }
    return () => {
      for (const evt of events) window.removeEventListener(evt, tryResume, true);
    };
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Map area */}
      <div className="relative flex-1">
        {/* Top-center header — kept clear of Leaflet's left-side zoom/draw toolbar
            and the right-side location controls. */}
        <div className="pointer-events-none absolute top-2 left-1/2 z-[1000] -translate-x-1/2">
          <div className="pointer-events-auto rounded border border-neutral-800 bg-neutral-950/85 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
            <div className="font-semibold">#{roomId}</div>
            <div className="text-[10px] text-neutral-400">
              {roomType ?? "…"} · {isConnected ? "connected" : "connecting…"} · {shapesCount} zone(s){" "}
              {canMutate && "· admin"}
            </div>
            <div
              className="mt-1 flex items-center gap-1.5 text-[10px]"
              title="NTP sync state — needs ~10 probes before clocks are aligned. Drift before this point is expected."
            >
              <span className={`inline-block size-1.5 rounded-full ${isSynced ? "bg-green-500" : "bg-amber-500"}`} />
              <span className={isSynced ? "text-green-400" : "text-amber-400"}>{isSynced ? "synced" : "syncing"}</span>
              <span className="text-neutral-500">
                · offset {offsetEstimate.toFixed(1)}ms · probes {probeStats.pureCount}/{probeStats.totalSent}
              </span>
            </div>
            <DebugPanel />
          </div>
        </div>

        {/* Top-right location controls */}
        <div className="absolute top-2 right-2 z-[1000] flex gap-1">
          <Button
            size="sm"
            variant={locationMode === "manual" ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setLocationMode("manual")}
          >
            <MousePointer className="mr-1 size-3" /> Manual
          </Button>
          <Button
            size="sm"
            variant={locationMode === "gps" ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setLocationMode("gps")}
            disabled={!isSupported}
          >
            <MapPin className="mr-1 size-3" /> GPS
          </Button>
        </div>

        {/* GPS feedback bar */}
        {locationMode === "gps" && (
          <div className="absolute bottom-2 right-2 z-[1000] rounded border border-neutral-800 bg-neutral-950/85 px-3 py-1.5 text-[11px] shadow backdrop-blur">
            {gpsError ? (
              <span className="text-red-400">⚠️ {gpsError}</span>
            ) : isWatching && latitude != null && longitude != null ? (
              <>
                <div>
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
                {accuracy != null && <div className="text-neutral-500">±{accuracy.toFixed(0)}m</div>}
              </>
            ) : (
              <span>Acquiring GPS…</span>
            )}
          </div>
        )}

        {/* Manual-mode help */}
        {locationMode === "manual" && !ownPosition && (
          <div className="absolute bottom-2 left-1/2 z-[1000] -translate-x-1/2 rounded border border-neutral-800 bg-neutral-950/90 px-3 py-1.5 text-[11px] text-neutral-300 shadow">
            Click the map to set your position.
          </div>
        )}

        <MapCanvas canMutate={canMutate} />
      </div>

      {/* Right side panel — playlist UI for the selected shape. Uses the same
          per-context playlist primitive as audio rooms, scoped by shape.id. */}
      <div className="hidden w-80 shrink-0 md:block">
        <ShapePlaylistPanel canMutate={canMutate} />
      </div>
    </div>
  );
};
