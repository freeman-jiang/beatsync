import { BackupManager } from "./managers/BackupManager";
import { getActiveRooms } from "./routes/active";
import { handleGetDefaultAudio } from "./routes/default";
import { handleDiscover } from "./routes/discover";
import { handleRoot } from "./routes/root";
import { handleStats } from "./routes/stats";
import { handleGetPresignedURL, handleUploadComplete } from "./routes/upload";
import { handleWebSocketUpgrade } from "./routes/websocket";
import {
  handleClose,
  handleMessage,
  handleOpen,
} from "./routes/websocketHandlers";
import { corsHeaders, errorResponse } from "./utils/responses";
import { WSData } from "./utils/websocket";

// Bun.serve with WebSocket support
const server = Bun.serve<WSData, undefined>({
  hostname: "0.0.0.0",
  port: 8080,
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

        case "/discover":
          return handleDiscover(req);

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
  console.error("Failed to restore state on startup:", error);
});

// Set up periodic backups every minute (for Render persistence issues)
const BACKUP_INTERVAL_MS = 60 * 1000; // 1 minute
setInterval(() => {
  console.log("🔄 Performing periodic backup at", new Date().toISOString());
  BackupManager.backupState().catch((error) => {
    console.error("Failed to perform periodic backup:", error);
  });
}, BACKUP_INTERVAL_MS);

// Simple graceful shutdown
const shutdown = async () => {
  console.log("\n⚠️ Shutting down...");

  server.stop(); // Stop accepting new connections
  await BackupManager.backupState(); // Save state

  process.exit(0);
};

// Handle shutdown signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
