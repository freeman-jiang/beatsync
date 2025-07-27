import { PlaybackControlsPermissionsEnum } from "@beatsync/shared";
import { ServerWebSocket } from "bun";
import { globalManager, RoomManager } from "../managers";
import { WSData } from "../utils/websocket";

export const requireRoom = (
  ws: ServerWebSocket<WSData>
): { room: RoomManager } => {
  if (!ws.data.roomId) {
    throw new Error(
      "WebSocket connection missing roomId - client not properly joined to a room"
    );
  }

  const room = globalManager.getRoom(ws.data.roomId);

  if (!room) {
    throw new Error(
      `Room ${ws.data.roomId} not found in global manager - room may have been cleaned up or never existed`
    );
  }

  return { room };
};

export const requireRoomAdmin = (
  ws: ServerWebSocket<WSData>
): { room: RoomManager } => {
  const { room } = requireRoom(ws);
  const client = room.getClient(ws.data.clientId);
  if (!client)
    throw new Error(
      `Client ${ws.data.clientId} does not exist in room ${ws.data.roomId}`
    );

  if (!client.isAdmin) {
    throw new Error(
      `Client ${ws.data.clientId} is not an admin in room ${ws.data.roomId}`
    );
  }
  return { room };
};

export const requireCanMutate = (
  ws: ServerWebSocket<WSData>
): { room: RoomManager } => {
  const { room } = requireRoom(ws);
  const client = room.getClient(ws.data.clientId);
  if (!client)
    throw new Error(
      `Client ${ws.data.clientId} does not exist in room ${ws.data.roomId}`
    );

  const canMutate =
    room.getPlaybackControlsPermissions() ===
      PlaybackControlsPermissionsEnum.enum.EVERYONE || client.isAdmin;

  if (!canMutate) {
    throw new Error(
      `Client ${ws.data.clientId} does not have permission to mutate in room ${ws.data.roomId}`
    );
  }

  return { room };
};
