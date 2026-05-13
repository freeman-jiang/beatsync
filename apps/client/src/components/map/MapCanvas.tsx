"use client";
// Leaflet wrapper for map rooms. Owns the L.Map instance, manages draw controls for
// admins, renders shapes from the store, and renders user markers.
//
// All inputs are read from stores (room/mapStore/global). Outputs (shape mutations,
// position updates) are sent via WebSocket using sendWSRequest.

import { useClientId } from "@/hooks/useClientId";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { useRoomStore } from "@/store/room";
import { sendWSRequest } from "@/utils/ws";
import type { ShapeType } from "@beatsync/shared";
import { ClientActionEnum } from "@beatsync/shared";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useMemo, useRef } from "react";

// Fix Leaflet's default-icon issue under bundlers. Leaflet looks for relative image
// paths that don't exist in a Next bundle; replace with public CDN-served URLs.
const DefaultIcon = L.icon({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapCanvasProps {
  canMutate: boolean;
}

export const MapCanvas = ({ canMutate }: MapCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  // Map shape.id → the Leaflet layer that renders it.
  const shapeLayersRef = useRef<Map<string, L.Layer>>(new Map());
  // Map clientId → marker layer for other users.
  const otherMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // Single marker for the current client.
  const ownMarkerRef = useRef<L.Marker | null>(null);
  const isDraggingOwnRef = useRef(false);

  const mapMetadata = useRoomStore((s) => s.mapMetadata);
  const connectedClients = useGlobalStore((s) => s.connectedClients);
  const shapes = useMapStore((s) => s.shapes);
  const selectedShapeId = useMapStore((s) => s.selectedShapeId);
  const ownPosition = useMapStore((s) => s.ownPosition);
  const setOwnPosition = useMapStore((s) => s.setOwnPosition);
  const { clientId: myClientId } = useClientId();

  // ── Initialize Leaflet map once ────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngTuple = mapMetadata?.center ?? [42.2808, -83.743];
    const zoom = mapMetadata?.zoom ?? 17;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 22,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    if (canMutate) {
      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
          polygon: { allowIntersection: false, showArea: false },
          rectangle: false, // duplicates polygon for our purposes
          circle: {},
          circlemarker: false,
          marker: false,
          polyline: false,
        },
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (event) => {
        const e = event as L.DrawEvents.Created;
        const layer = e.layer;
        const id =
          (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
          `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        let coordinates: unknown;
        if (e.layerType === "circle" && layer instanceof L.Circle) {
          const c = layer.getLatLng();
          coordinates = { center: [c.lat, c.lng], radius: layer.getRadius() };
        } else if (layer instanceof L.Polygon) {
          coordinates = (layer.getLatLngs() as L.LatLng[][]).map((ring) => ring.map((pt) => [pt.lat, pt.lng]));
        } else {
          return;
        }

        const ws = useGlobalStore.getState().socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        sendWSRequest({
          ws,
          request: {
            type: ClientActionEnum.enum.ADD_SHAPE,
            shape: {
              id,
              type: e.layerType,
              coordinates,
              createdBy: myClientId ?? "anonymous",
              createdAt: Date.now(),
              groupId: null,
              audibleRadiusMeters: 50,
            },
          },
        });
        // Don't add the layer locally — the server's SHAPES_UPDATE will broadcast it
        // back and our shape-render effect will draw it. This keeps the visual state
        // single-sourced from the store.
      });

      map.on(L.Draw.Event.DELETED, (event) => {
        const e = event as L.DrawEvents.Deleted;
        const ws = useGlobalStore.getState().socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        e.layers.eachLayer((layer) => {
          for (const [id, l] of shapeLayersRef.current.entries()) {
            if (l === layer) {
              sendWSRequest({
                ws,
                request: { type: ClientActionEnum.enum.DELETE_SHAPE, shapeId: id },
              });
              break;
            }
          }
        });
      });

      map.on(L.Draw.Event.EDITED, (event) => {
        const e = event as L.DrawEvents.Edited;
        const ws = useGlobalStore.getState().socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        e.layers.eachLayer((layer) => {
          let shapeId: string | undefined;
          for (const [id, l] of shapeLayersRef.current.entries()) {
            if (l === layer) {
              shapeId = id;
              break;
            }
          }
          if (!shapeId) return;
          let coordinates: unknown;
          if (layer instanceof L.Circle) {
            const c = layer.getLatLng();
            coordinates = { center: [c.lat, c.lng], radius: layer.getRadius() };
          } else if (layer instanceof L.Polygon) {
            coordinates = (layer.getLatLngs() as L.LatLng[][]).map((ring) => ring.map((pt) => [pt.lat, pt.lng]));
          } else {
            return;
          }
          sendWSRequest({
            ws,
            request: { type: ClientActionEnum.enum.UPDATE_SHAPE, shapeId, coordinates },
          });
        });
      });
    }

    // Manual-mode drag: clicking the map sets the user's position. (For phones,
    // the GPS path also flows through setOwnPosition once permission is granted.)
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (useMapStore.getState().locationMode !== "manual") return;
      setOwnPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      const ws = useGlobalStore.getState().socket;
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendWSRequest({
          ws,
          request: {
            type: ClientActionEnum.enum.SET_GEO_POSITION,
            lat: e.latlng.lat,
            lng: e.latlng.lng,
          },
        });
      }
    });

    drawnItemsRef.current = drawnItems;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      shapeLayersRef.current.clear();
      otherMarkersRef.current.clear();
      ownMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMutate]);

  // Re-center when mapMetadata changes (curator hit "Set map view").
  useEffect(() => {
    if (mapRef.current && mapMetadata) {
      mapRef.current.setView(mapMetadata.center, mapMetadata.zoom);
    }
  }, [mapMetadata]);

  // ── Sync shapes → Leaflet layers ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const group = drawnItemsRef.current;
    if (!map || !group) return;

    const seen = new Set<string>();
    for (const shape of shapes.values()) {
      seen.add(shape.id);
      let layer = shapeLayersRef.current.get(shape.id);
      const coords = shape.coordinates as unknown;

      // Decide if existing layer is still right-typed, else remove + recreate.
      const isCircleCoords = coords && typeof coords === "object" && "center" in coords && "radius" in coords;
      const wantsCircle = !!isCircleCoords;
      const isCircle = layer instanceof L.Circle;

      if (layer && wantsCircle !== isCircle) {
        group.removeLayer(layer);
        layer = undefined;
      }

      if (!layer) {
        if (wantsCircle) {
          const { center, radius } = coords as { center: [number, number]; radius: number };
          layer = L.circle(center as L.LatLngTuple, {
            radius,
            color: "#22c55e",
            fillOpacity: 0.15,
          });
        } else if (Array.isArray(coords)) {
          layer = L.polygon(coords as L.LatLngExpression[][], {
            color: "#22c55e",
            fillOpacity: 0.15,
          });
        } else {
          continue;
        }
        group.addLayer(layer);
        shapeLayersRef.current.set(shape.id, layer);
        // Click on a shape selects it for the playlist panel. Capture by id;
        // the store call is read fresh so this doesn't go stale when the
        // selection changes.
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          useMapStore.getState().setSelectedShapeId(shape.id);
        });
      } else if (layer instanceof L.Circle && wantsCircle) {
        const { center, radius } = coords as { center: [number, number]; radius: number };
        layer.setLatLng(center as L.LatLngTuple);
        layer.setRadius(radius);
      } else if (layer instanceof L.Polygon && Array.isArray(coords)) {
        layer.setLatLngs(coords as L.LatLngExpression[][]);
      }

      // Tooltip shows the shape id; playlist details (track count, play state)
      // are visible in the side panel that hosts the Queue/Player UI.
      layer.bindTooltip(`<div class="text-xs"><strong>${shape.id.slice(0, 6)}</strong></div>`, {
        permanent: false,
        direction: "top",
      });
    }

    // Remove layers for shapes that no longer exist.
    for (const [id, layer] of shapeLayersRef.current.entries()) {
      if (!seen.has(id)) {
        group.removeLayer(layer);
        shapeLayersRef.current.delete(id);
      }
    }
  }, [shapes]);

  // ── Highlight the selected shape ────────────────────────────────
  useEffect(() => {
    for (const [id, layer] of shapeLayersRef.current.entries()) {
      const isSelected = id === selectedShapeId;
      if (layer instanceof L.Path) {
        layer.setStyle({
          color: isSelected ? "#fde047" : "#22c55e",
          weight: isSelected ? 3 : 2,
          fillOpacity: isSelected ? 0.25 : 0.15,
        });
      }
    }
  }, [selectedShapeId, shapes]);

  // ── Sync other users' markers ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const myId = myClientId;
    const seen = new Set<string>();

    for (const client of connectedClients) {
      if (client.clientId === myId) continue;
      if (!client.geoPosition) continue;
      seen.add(client.clientId);
      const existing = otherMarkersRef.current.get(client.clientId);
      const pos: L.LatLngTuple = [client.geoPosition.lat, client.geoPosition.lng];
      if (existing) {
        existing.setLatLng(pos);
      } else {
        const marker = L.marker(pos, {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            className: "",
          }),
        });
        marker.bindTooltip(client.username || client.clientId, { direction: "top" });
        marker.addTo(map);
        otherMarkersRef.current.set(client.clientId, marker);
      }
    }
    for (const [id, marker] of otherMarkersRef.current.entries()) {
      if (!seen.has(id)) {
        map.removeLayer(marker);
        otherMarkersRef.current.delete(id);
      }
    }
  }, [connectedClients, myClientId]);

  // ── Own marker: render + drag handling ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!ownPosition) {
      if (ownMarkerRef.current) {
        map.removeLayer(ownMarkerRef.current);
        ownMarkerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngTuple = [ownPosition.lat, ownPosition.lng];
    if (ownMarkerRef.current) {
      if (!isDraggingOwnRef.current) ownMarkerRef.current.setLatLng(pos);
    } else {
      const marker = L.marker(pos, {
        draggable: true,
        icon: L.divIcon({
          html: `<div style="width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: "",
        }),
      });
      marker.bindTooltip("You", { direction: "top" });
      marker.on("dragstart", () => {
        isDraggingOwnRef.current = true;
      });
      marker.on("drag", (e: L.LeafletEvent) => {
        const m = e.target as L.Marker;
        const p = m.getLatLng();
        setOwnPosition({ lat: p.lat, lng: p.lng });
      });
      marker.on("dragend", () => {
        isDraggingOwnRef.current = false;
        const p = marker.getLatLng();
        const ws = useGlobalStore.getState().socket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          sendWSRequest({
            ws,
            request: { type: ClientActionEnum.enum.SET_GEO_POSITION, lat: p.lat, lng: p.lng },
          });
        }
      });
      marker.addTo(map);
      ownMarkerRef.current = marker;
    }
  }, [ownPosition, setOwnPosition]);

  return <div ref={containerRef} className="absolute inset-0 z-0" style={{ width: "100%", height: "100%" }} />;
};

/** Compute "is my client an admin in this room?" from the connectedClients list. */
export function useCanMutate(): boolean {
  const connectedClients = useGlobalStore((s) => s.connectedClients);
  const { clientId } = useClientId();
  return useMemo(() => {
    const me = connectedClients.find((c) => c.clientId === clientId);
    return !!me?.isAdmin;
  }, [connectedClients, clientId]);
}

export type { ShapeType };
