"use client";
// Zustand store for map-room specific state. Kept separate from `global.tsx` (which is
// already ~1600 lines of audio-room state) so the two experiences don't entangle.
//
// What lives here:
//  - Shapes (server-authoritative; mirrored from SHAPES_UPDATE)
//  - Per-shape audio chains (Web Audio nodes — populated by mapAudio.ts, P9)
//  - The client's own GPS / manual position
//  - Per-shape proximity gains, derived from the GPS + shape coordinates
//
// What does NOT live here:
//  - WebSocket / NTP / connection state — still globalStore
//  - The audio context itself — still globalStore (shared with audio rooms)

import type { AudioSourceType, GeoPositionType, ShapePlaybackStateType, ShapeStateType } from "@beatsync/shared";
import { create } from "zustand";

export type LocationMode = "manual" | "gps";

interface ShapeAudioChain {
  // Populated by the map-audio engine in P9. Each chain holds an
  // AudioBufferSourceNode + GainNode pair feeding the destination.
  buffer?: AudioBuffer;
  // Currently scheduled-to-start time (epochMs from the server's clock). Used to
  // compute the right offset when (re)scheduling playback.
  scheduledStartMs?: number;
}

interface MapStateValues {
  // Shape state, keyed by id for O(1) updates.
  shapes: Map<string, ShapeStateType>;

  // Per-shape proximity gain (0..1). Recomputed whenever the client's position or any
  // shape's geometry changes. Audio chains apply this via linearRampToValueAtTime.
  proximityGains: Map<string, number>;

  // Per-shape Web Audio chains. Set by mapAudio.ts (P9) on buffer load/unload.
  audioChains: Map<string, ShapeAudioChain>;

  // The client's own GPS position (when locationMode is "gps") or manually-set marker
  // position (when locationMode is "manual"). undefined until the client provides one.
  ownPosition?: GeoPositionType;
  locationMode: LocationMode;

  // Max distance at which any shape can be heard (meters). Each shape can override via
  // shape.audibleRadiusMeters; this is the global cap for buffer-load decisions.
  audibleRadiusMeters: number;
}

interface MapStoreActions {
  // Server-driven updates
  setShapes: (shapes: ShapeStateType[]) => void;
  updateShape: (state: ShapeStateType) => void;
  setShapePlayback: (shapeId: string, playback: ShapePlaybackStateType) => void;
  setShapePlaylist: (shapeId: string, playlist: AudioSourceType[]) => void;
  removeShape: (shapeId: string) => void;

  // Client-driven
  setOwnPosition: (position: GeoPositionType) => void;
  setLocationMode: (mode: LocationMode) => void;
  setProximityGain: (shapeId: string, gain: number) => void;
  setProximityGains: (gains: Map<string, number>) => void;

  // Audio engine (P9)
  setShapeAudioChain: (shapeId: string, chain: ShapeAudioChain | undefined) => void;

  reset: () => void;
}

type MapState = MapStateValues & MapStoreActions;

const initialState: MapStateValues = {
  shapes: new Map(),
  proximityGains: new Map(),
  audioChains: new Map(),
  ownPosition: undefined,
  locationMode: "manual",
  audibleRadiusMeters: 500,
};

export const useMapStore = create<MapState>()((set) => ({
  ...initialState,

  setShapes: (shapes) =>
    set(() => ({
      shapes: new Map(shapes.map((s) => [s.shape.id, s])),
    })),

  updateShape: (state) =>
    set((s) => {
      const next = new Map(s.shapes);
      next.set(state.shape.id, state);
      return { shapes: next };
    }),

  setShapePlayback: (shapeId, playback) =>
    set((s) => {
      const existing = s.shapes.get(shapeId);
      if (!existing) return s;
      const next = new Map(s.shapes);
      next.set(shapeId, { ...existing, playbackState: playback });
      return { shapes: next };
    }),

  setShapePlaylist: (shapeId, playlist) =>
    set((s) => {
      const existing = s.shapes.get(shapeId);
      if (!existing) return s;
      const next = new Map(s.shapes);
      next.set(shapeId, { ...existing, playlist });
      return { shapes: next };
    }),

  removeShape: (shapeId) =>
    set((s) => {
      if (!s.shapes.has(shapeId)) return s;
      const next = new Map(s.shapes);
      next.delete(shapeId);
      const gains = new Map(s.proximityGains);
      gains.delete(shapeId);
      const chains = new Map(s.audioChains);
      chains.delete(shapeId);
      return { shapes: next, proximityGains: gains, audioChains: chains };
    }),

  setOwnPosition: (ownPosition) => set({ ownPosition }),
  setLocationMode: (locationMode) => set({ locationMode }),

  setProximityGain: (shapeId, gain) =>
    set((s) => {
      const next = new Map(s.proximityGains);
      next.set(shapeId, gain);
      return { proximityGains: next };
    }),

  setProximityGains: (proximityGains) => set({ proximityGains: new Map(proximityGains) }),

  setShapeAudioChain: (shapeId, chain) =>
    set((s) => {
      const next = new Map(s.audioChains);
      if (chain) next.set(shapeId, chain);
      else next.delete(shapeId);
      return { audioChains: next };
    }),

  reset: () => set(() => ({ ...initialState, shapes: new Map(), proximityGains: new Map(), audioChains: new Map() })),
}));
