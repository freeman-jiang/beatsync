// Map-room WS handlers. These cover shape geometry, map metadata, and client
// presence (geo position + visibility). Playlist mutations (adding tracks,
// play/pause, loop toggling) flow through the unified per-context actions
// (ADD_AUDIO_SOURCE / PLAY / PAUSE / SET_CONTEXT_LOOP / ...) using
// contextId = shape.id — there are NO shape-specific audio actions.

import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate, requireRoom } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { RoomManager } from "@/managers";
import type { BunServer } from "@/utils/websocket";

/**
 * Broadcast the current shape geometry list. Sent on every mutation. The
 * matching playlists (per-context audio state) flow through the separate
 * PLAYLISTS_UPDATE event broadcast by the per-context actions.
 */
function broadcastShapes(room: RoomManager, server: BunServer): void {
  sendBroadcast({
    server,
    roomId: room.getRoomId(),
    message: {
      type: "ROOM_EVENT",
      event: { type: "SHAPES_UPDATE", shapes: room.getShapes() },
    },
  });
}

/**
 * Broadcast the full playlists snapshot. Used after any shape mutation that
 * adds/removes a playlist context (addShape, deleteShape, clearShapes), so
 * clients see the matching playlist list update in lockstep.
 */
function broadcastPlaylists(room: RoomManager, server: BunServer): void {
  sendBroadcast({
    server,
    roomId: room.getRoomId(),
    message: {
      type: "ROOM_EVENT",
      event: { type: "PLAYLISTS_UPDATE", playlists: room.getPlaylistsView() },
    },
  });
}

// ── Shape geometry ─────────────────────────────────────────────────

export const handleAddShape: HandlerFunction<ExtractWSRequestFrom["ADD_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.addShape(message.shape)) return;
  broadcastShapes(room, server);
  broadcastPlaylists(room, server);
};

export const handleUpdateShape: HandlerFunction<ExtractWSRequestFrom["UPDATE_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.updateShapeCoordinates(message.shapeId, message.coordinates)) return;
  broadcastShapes(room, server);
};

export const handleDeleteShape: HandlerFunction<ExtractWSRequestFrom["DELETE_SHAPE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.deleteShape(message.shapeId)) return;
  broadcastShapes(room, server);
  broadcastPlaylists(room, server);
};

export const handleClearShapes: HandlerFunction<ExtractWSRequestFrom["CLEAR_SHAPES"]> = ({ ws, server }) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  room.clearShapes();
  broadcastShapes(room, server);
  broadcastPlaylists(room, server);
};

export const handleSetShapeFalloff: HandlerFunction<ExtractWSRequestFrom["SET_SHAPE_FALLOFF"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.setShapeFalloff(message.shapeId, message.falloffMeters)) return;
  broadcastShapes(room, server);
};

export const handleSetShapeGroup: HandlerFunction<ExtractWSRequestFrom["SET_SHAPE_GROUP"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  if (!room.isMapRoom()) return;
  if (!room.setShapeGroup(message.shapeId, message.groupId)) return;
  broadcastShapes(room, server);
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

// ── Client presence (participation, not curation) ──────────────────

export const handleSetGeoPosition: HandlerFunction<ExtractWSRequestFrom["SET_GEO_POSITION"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireRoom(ws);
  if (!room.isMapRoom()) return;
  const changed = room.setClientGeoPosition(ws.data.clientId, { lat: message.lat, lng: message.lng });
  if (!changed) return;
  // Broadcast the updated client list so every other tab/device sees the new
  // marker position. Manual mode only sends on dragend; GPS sends ~every 1s
  // (browser-throttled), so a full client-list broadcast per update is fine.
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "CLIENT_CHANGE", clients: room.getClients() },
    },
  });
};

export const handleSetVisibility: HandlerFunction<ExtractWSRequestFrom["SET_VISIBILITY"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireRoom(ws);
  const changed = room.setClientVisibility(ws.data.clientId, message.isHidden);
  if (!changed) return;
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "CLIENT_CHANGE", clients: room.getClients() },
    },
  });
};
