import { IS_DEMO_MODE, isValidAdminSecret } from "@/demo";
import { errorResponse } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";

export const handleWebSocketUpgrade = (req: Request, server: BunServer) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const username = url.searchParams.get("username");
  const clientId = url.searchParams.get("clientId");
  const adminSecret = url.searchParams.get("admin");

  if (!roomId || !username || !clientId) {
    // Check which parameters are missing and log them
    const missingParams = [];

    if (!roomId) missingParams.push("roomId");
    if (!username) missingParams.push("username");
    if (!clientId) missingParams.push("clientId");

    console.log(`WebSocket connection attempt missing parameters: ${missingParams.join(", ")}`);

    return errorResponse("roomId, username and clientId are required");
  }

  // Check if client provided valid admin secret
  const isAdmin = IS_DEMO_MODE && isValidAdminSecret(adminSecret);

  console.log(`User ${username} joined room ${roomId} with clientId ${clientId}${isAdmin ? " (admin)" : ""}`);

  const data: WSData = {
    roomId,
    username,
    clientId,
    isAdmin,
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
