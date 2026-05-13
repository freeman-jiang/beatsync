"use client";
// Zustand store for map-room geometry + presence state. Kept separate from
// global.tsx so the audio engine doesn't entangle with map-only concerns.
//
// What lives here:
//   - shapes: geometry list mirrored from SHAPES_UPDATE
//   - ownPosition / locationMode: this client's GPS or manual marker
//   - proximityGains: per-shape gain values derived from GPS distance
//
// What does NOT live here:
//   - Playlist tracks / playback state — those live in globalStore as per-context
//     playlist data (one playlist per shape, contextId = shape.id). The unified
//     audio engine handles per-context audio chains.
//   - WebSocket / NTP / AudioContext — globalStore.

import type { GeoPositionType, ShapeType } from "@beatsync/shared";
import { create } from "zustand";

export type LocationMode = "manual" | "gps";

interface ShapeAudioChain {
  buffer?: AudioBuffer;
  scheduledStartMs?: number;
}

interface MapStateValues {
  /** Shape geometry only — keyed by shape.id (which is also the context id). */
  shapes: Map<string, ShapeType>;

  /** Per-shape proximity gain (0..1). Recomputed on each GPS update. */
  proximityGains: Map<string, number>;

  /** Per-shape Web Audio chains (set by mapAudio.ts on buffer load/unload). */
  audioChains: Map<string, ShapeAudioChain>;

  /** This client's position (manual marker drag or GPS). */
  ownPosition?: GeoPositionType;
  locationMode: LocationMode;

  /** Global default falloff distance (per-shape can override via shape.falloffMeters). */
  defaultFalloffMeters: number;

  /** Which shape is currently selected (drives the per-shape playlist panel). */
  selectedShapeId: string | null;
}

interface MapStoreActions {
  setShapes: (shapes: ShapeType[]) => void;
  updateShape: (shape: ShapeType) => void;
  removeShape: (shapeId: string) => void;

  setOwnPosition: (position: GeoPositionType) => void;
  setLocationMode: (mode: LocationMode) => void;
  setProximityGain: (shapeId: string, gain: number) => void;
  setProximityGains: (gains: Map<string, number>) => void;

  setShapeAudioChain: (shapeId: string, chain: ShapeAudioChain | undefined) => void;

  setSelectedShapeId: (shapeId: string | null) => void;

  reset: () => void;
}

type MapState = MapStateValues & MapStoreActions;

const initialState: MapStateValues = {
  shapes: new Map(),
  proximityGains: new Map(),
  audioChains: new Map(),
  ownPosition: undefined,
  locationMode: "manual",
  defaultFalloffMeters: 25,
  selectedShapeId: null,
};

export const useMapStore = create<MapState>()((set) => ({
  ...initialState,

  setShapes: (shapes) =>
    set((s) => {
      const next = new Map(shapes.map((sh) => [sh.id, sh]));
      const selectedShapeId = s.selectedShapeId && next.has(s.selectedShapeId) ? s.selectedShapeId : null;
      return { shapes: next, selectedShapeId };
    }),

  updateShape: (shape) =>
    set((s) => {
      const next = new Map(s.shapes);
      next.set(shape.id, shape);
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
      const selectedShapeId = s.selectedShapeId === shapeId ? null : s.selectedShapeId;
      return { shapes: next, proximityGains: gains, audioChains: chains, selectedShapeId };
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

  setSelectedShapeId: (selectedShapeId) => set({ selectedShapeId }),

  reset: () =>
    set(() => ({
      ...initialState,
      shapes: new Map(),
      proximityGains: new Map(),
      audioChains: new Map(),
    })),
}));
