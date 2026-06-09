import { globalManager } from "@/managers";
import { errorResponse, jsonResponse } from "@/utils/responses";

/**
 * GET /room-info?roomId=<id>
 * Returns whether the room exists and is private.
 * Used by the client before connecting the WebSocket so it can
 * show the password prompt when needed.
 */
export const handleRoomInfo = (req: Request): Response => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");

  if (!roomId) {
    return errorResponse("roomId is required", 400);
  }

  const room = globalManager.getRoom(roomId);

  // Room doesn't exist yet – it's public (will be created on first WS connect)
  const isPrivate = room ? room.getIsPrivate() : false;

  return jsonResponse({ roomId, isPrivate });
};
