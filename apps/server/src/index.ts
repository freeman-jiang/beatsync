import { handleCleanup } from "./routes/cleanup";
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
import { StateManager } from "./managers/StateManager";

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

        case "/cleanup":
          return handleCleanup(req);

        case "/default":
          return handleGetDefaultAudio(req);

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
StateManager.restoreState().catch((error) => {
  console.error("Failed to restore state on startup:", error);
});

// Track if we're already shutting down to prevent multiple executions
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log("⏳ Shutdown already in progress...");
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n⚠️ ${signal} received, starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    server.stop();
    console.log("🛑 Server stopped accepting new connections");

    // Backup current state
    await StateManager.backupState();
    console.log("💾 State backed up successfully");

    // Exit gracefully
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle SIGINT with force exit on multiple Ctrl+C
process.on("SIGINT", () => {
  if (isShuttingDown) {
    console.log("\n⚠️ Force exit requested. Terminating immediately...");
    process.exit(1);
  } else {
    gracefulShutdown("SIGINT");
  }
});
