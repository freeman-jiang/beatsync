// Real handlers for the map-room WS protocol. Originally landed as stubs alongside the
// shared-package contract work; this file is the P3 implementation.
//
// All curator mutations (shapes, playlists, map metadata) go through requireCanMutate.
// Client presence (SET_GEO_POSITION, SET_VISIBILITY) is participation and only requires
// the room to exist.

import type { ExtractWSRequestFrom, ShapeStateType } from "@beatsync/shared";
import type { RoomManager } from "@/managers";
import { sendBroadcast } from "@/utils/responses";
import type { BunServer } from "@/utils/websocket";
import { requireCanMutate, requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

// Broadcast a fresh snapshot of every shape's state to all clients in the room. Used after
// every shape mutation. Granular per-shape deltas can replace this later if profiling shows
// SHAPES_UPDATE traffic is a bottleneck.
function broadcastShapesUpdate(room: RoomManager, server: BunServer): void {
  const shapes: ShapeStateType[] = room.getShapeStates();
  sendBroadcast({
    server,
    roomId: room.getRoomId(),
    message: {
      type: "ROOM_EVENT",
      event: { type: "SHAPES_UPDATE", shapes },
    },
  });
}

// ── Shape geometry ─────────────────────────────────────────────────

export const handleAddShape: HandlerFunction<ExtractWSRequestFrom["ADD_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) {
    console.warn(`ADD_SHAPE rejected: room ${room.getRoomId()} is not a map room`);
    return;
  }
  if (!room.addShape(message.shape)) {
    console.warn(`ADD_SHAPE rejected: shape ${message.shape.id} already exists in room ${room.getRoomId()}`);
    return;
  }
  broadcastShapesUpdate(room, server);
};

export const handleUpdateShape: HandlerFunction<ExtractWSRequestFrom["UPDATE_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.updateShapeCoordinates(message.shapeId, message.coordinates)) return;
  broadcastShapesUpdate(room, server);
};

export const handleDeleteShape: HandlerFunction<ExtractWSRequestFrom["DELETE_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.deleteShape(message.shapeId)) return;
  broadcastShapesUpdate(room, server);
};

export const handleClearShapes: HandlerFunction<ExtractWSRequestFrom["CLEAR_SHAPES"]> = ({ ws, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  room.clearShapes();
  broadcastShapesUpdate(room, server);
};

// ── Shape playlist ─────────────────────────────────────────────────

export const handleAddShapeAudioSource: HandlerFunction<ExtractWSRequestFrom["ADD_SHAPE_AUDIO_SOURCE"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  const playlist = room.addShapeAudioSource(message.shapeId, message.source);
  if (!playlist) return;
  broadcastShapesUpdate(room, server);
};

export const handleRemoveShapeAudioSources: HandlerFunction<ExtractWSRequestFrom["REMOVE_SHAPE_AUDIO_SOURCES"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  const result = room.removeShapeAudioSources(message.shapeId, message.urls);
  if (!result) return;
  broadcastShapesUpdate(room, server);
};

export const handleReorderShapePlaylist: HandlerFunction<ExtractWSRequestFrom["REORDER_SHAPE_PLAYLIST"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  const result = room.reorderShapePlaylist(message.shapeId, message.reorderedAudioSources);
  if (result instanceof Error) {
    console.warn(`REORDER_SHAPE_PLAYLIST rejected: ${result.message}`);
    return;
  }
  broadcastShapesUpdate(room, server);
};

// ── Shape behavior ─────────────────────────────────────────────────

export const handleSetShapeLoop: HandlerFunction<ExtractWSRequestFrom["SET_SHAPE_LOOP"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.setShapeLoop(message.shapeId, message.loop)) return;
  broadcastShapesUpdate(room, server);
};

export const handleSetShapeGroup: HandlerFunction<ExtractWSRequestFrom["SET_SHAPE_GROUP"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.setShapeGroup(message.shapeId, message.groupId)) return;
  broadcastShapesUpdate(room, server);
};

export const handleSetShapeAudibleRadius: HandlerFunction<ExtractWSRequestFrom["SET_SHAPE_AUDIBLE_RADIUS"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.setShapeAudibleRadius(message.shapeId, message.audibleRadiusMeters)) return;
  broadcastShapesUpdate(room, server);
};

// ── Map metadata ───────────────────────────────────────────────────

export const handleSetMapMetadata: HandlerFunction<ExtractWSRequestFrom["SET_MAP_METADATA"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  room.setMapMetadata(message.metadata);
  sendBroadcast({
    server,
    roomId: room.getRoomId(),
    message: {
      type: "ROOM_EVENT",
      event: { type: "MAP_METADATA_UPDATE", metadata: message.metadata },
    },
  });
};

// ── Client presence ────────────────────────────────────────────────
// These are participation (not curation), so they only require the room to exist.
// We don't broadcast a CLIENT_CHANGE on every GPS update — that would flood the
// room. Instead, the room manager debounces CLIENT_CHANGE through its existing
// pendingClientChangeCb path. For now we mutate state silently; the client
// re-derives marker positions from the next CLIENT_CHANGE it receives.

export const handleSetGeoPosition: HandlerFunction<ExtractWSRequestFrom["SET_GEO_POSITION"]> = ({ ws, message }) => {
  const { room } = requireRoom(ws);
  if (!room.isMapRoom()) return;
  room.setClientGeoPosition(ws.data.clientId, { lat: message.lat, lng: message.lng });
};

export const handleSetVisibility: HandlerFunction<ExtractWSRequestFrom["SET_VISIBILITY"]> = ({ ws, message }) => {
  const { room } = requireRoom(ws);
  room.setClientVisibility(ws.data.clientId, message.isHidden);
};
