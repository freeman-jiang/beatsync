import { handleRoot } from "./routes/root";
import { handleStats } from "./routes/stats";
import { handleGetPresignedURL, handleUploadComplete } from "./routes/upload";
import { handleWebSocketUpgrade } from "./routes/websocket";
import { handleGetDefaultAudio } from "./routes/default";
import {
  handleClose,
  handleMessage,
  handleOpen,
} from "./routes/websocketHandlers";
import { corsHeaders, errorResponse } from "./utils/responses";
import { WSData } from "./utils/websocket";
import { BackupManager } from "./managers/BackupManager";
import { getActiveRooms } from "./routes/active";

// Bun.serve with WebSocket support
const server = Bun.serve<WSData, undefined>({
  hostname: process.env.HOST || "0.0.0.0",
  port: parseInt(process.env.PORT || "8080"),
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case "/":
          return handleRoot(req);

        case "/ws":
          return handleWebSocketUpgrade(req, server);

        case "/upload/get-presigned-url":
          return handleGetPresignedURL(req);

        case "/upload/complete":
          return handleUploadComplete(req, server);

        case "/stats":
          return handleStats();

        case "/default":
          return handleGetDefaultAudio(req);

        case "/active-rooms":
          return getActiveRooms(req);

        default:
          return errorResponse("Not found", 404);
      }
    } catch (err) {
      return errorResponse("Internal server error", 500);
    }
  },

  websocket: {
    open(ws) {
      handleOpen(ws, server);
    },

    message(ws, message) {
      handleMessage(ws, message, server);
    },

    close(ws) {
      handleClose(ws, server);
    },
  },
});

console.log(`HTTP listening on http://${server.hostname}:${server.port}`);

// Restore state from backup on startup
BackupManager.restoreState().catch((error) => {
  console.warn("⚠️ Failed to restore state on startup (this is normal in development without R2/S3):", error);
});

// Simple graceful shutdown
const shutdown = async () => {
  console.log("\n⚠️ Shutting down...");

  server.stop(); // Stop accepting new connections
  
  try {
    await BackupManager.backupState(); // Save state
  } catch (error) {
    console.warn("⚠️ Backup on shutdown failed (this is normal in development):", error);
  }

  process.exit(0);
};

// Handle shutdown signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
