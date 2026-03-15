import { DEMO_ROOM_ID, IS_DEMO_MODE, isValidAdminSecret } from "@/demo";
import { errorResponse } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";

const CREATOR_SECRET = process.env.CREATOR_SECRET;

export const handleWebSocketUpgrade = (req: Request, server: BunServer) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const username = url.searchParams.get("username");
  const clientId = url.searchParams.get("clientId");
  const adminSecret = url.searchParams.get("admin");
  const creatorSecret = url.searchParams.get("creator");

  if (!roomId || !username || !clientId) {
    // Check which parameters are missing and log them
    const missingParams = [];

    if (!roomId) missingParams.push("roomId");
    if (!username) missingParams.push("username");
    if (!clientId) missingParams.push("clientId");

    console.log(`WebSocket connection attempt missing parameters: ${missingParams.join(", ")}`);

    return errorResponse("roomId, username and clientId are required");
  }

  if (IS_DEMO_MODE && roomId !== DEMO_ROOM_ID) {
    console.log(`Demo mode: rejected room ${roomId} (only ${DEMO_ROOM_ID} allowed)`);
    return errorResponse(`Only room ${DEMO_ROOM_ID} is available in demo mode`);
  }

  // Check if client provided valid admin secret
  const isAdmin = IS_DEMO_MODE && isValidAdminSecret(adminSecret);

  const isCreator = !IS_DEMO_MODE && !!CREATOR_SECRET && creatorSecret === CREATOR_SECRET;

  const tags = [isAdmin && "admin", isCreator && "creator"].filter(Boolean).join(", ");
  console.log(`User ${username} joined room ${roomId} with clientId ${clientId}${tags ? ` (${tags})` : ""}`);

  const data: WSData = {
    roomId,
    username: isCreator ? "freemanjiang" : username,
    clientId,
    isAdmin,
    isCreator,
  };

  // Upgrade the connection with the WSData context
  const upgraded = server.upgrade(req, {
    data,
  });

  if (!upgraded) {
    return errorResponse("WebSocket upgrade failed");
  }

  return undefined;
};
