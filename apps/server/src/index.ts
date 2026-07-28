import { ADMIN_SECRET, IS_DEMO_MODE } from "@/demo";
import { BackupManager } from "@/managers/BackupManager";
import { getActiveRooms } from "@/routes/active";
import { handleGetDefaultAudio } from "@/routes/default";
import { handleServeAudio } from "@/routes/demoAudio";
import { handleDiscover } from "@/routes/discover";
import { handleHealth } from "@/routes/health";
import { handleRoot } from "@/routes/root";
import { handleStats } from "@/routes/stats";
import { handleGetPresignedURL, handleUploadComplete } from "@/routes/upload";
import { serveLocalAudio, storeLocalUpload } from "@/lib/r2";
import { handleWebSocketUpgrade } from "@/routes/websocket";
import { handleClose, handleMessage, handleOpen } from "@/routes/websocketHandlers";
import { corsHeaders, errorResponse } from "@/utils/responses";
import type { WSData } from "@/utils/websocket";

// Bun.serve with WebSocket support
const server = Bun.serve<WSData>({
  hostname: "0.0.0.0",
  port: 8080,
  async fetch(req, server) {
    const start = performance.now();
    const url = new URL(req.url);

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let response: Response;

    try {
      // Demo mode: serve local audio files
      if (IS_DEMO_MODE && url.pathname.startsWith("/audio/")) {
        response = handleServeAudio(url.pathname);
      } else if (url.pathname.startsWith("/upload/local/") && req.method === "PUT") {
        const [, , , roomId, fileName] = url.pathname.split("/");
        if (!roomId || !fileName) {
          response = errorResponse("Invalid local upload path", 400);
        } else {
          await storeLocalUpload(decodeURIComponent(roomId), decodeURIComponent(fileName), req);
          response = new Response(null, { status: 204, headers: corsHeaders });
        }
      } else if (url.pathname.startsWith("/audio/local/") && req.method === "GET") {
        const [, , , roomSegment, fileName] = url.pathname.split("/");
        const roomId = roomSegment?.startsWith("room-") ? roomSegment.slice(5) : "";
        response =
          roomId && fileName
            ? await serveLocalAudio(decodeURIComponent(roomId), decodeURIComponent(fileName))
            : errorResponse("Invalid local audio path", 400);
      } else {
        switch (url.pathname) {
          case "/":
            response = handleRoot(req);
            break;

          case "/ws":
            return handleWebSocketUpgrade(req, server);

          case "/upload/get-presigned-url":
            if (IS_DEMO_MODE) {
              response = errorResponse("Uploads disabled in demo mode", 403);
            } else {
              response = await handleGetPresignedURL(req);
            }
            break;

          case "/upload/complete":
            if (IS_DEMO_MODE) {
              response = errorResponse("Uploads disabled in demo mode", 403);
            } else {
              response = await handleUploadComplete(req, server);
            }
            break;

          case "/stats":
            response = await handleStats();
            break;

          case "/default":
            response = await handleGetDefaultAudio(req);
            break;

          case "/active-rooms":
            response = getActiveRooms(req);
            break;

          case "/discover":
            response = handleDiscover(req);
            break;

          case "/health":
            response = handleHealth();
            break;

          default:
            response = errorResponse("Not found", 404);
            break;
        }
      }
    } catch (error) {
      const durationMs = (performance.now() - start).toFixed(1);
      console.error(
        `[${new Date().toISOString()}] ${req.method} ${url.pathname} 500 ${durationMs}ms - Unhandled error:`,
        error
      );
      return errorResponse("Internal server error", 500);
    }

    const durationMs = (performance.now() - start).toFixed(1);
    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname} ${response.status} ${durationMs}ms`);

    return response;
  },

  websocket: {
    open(ws) {
      handleOpen(ws, server);
    },

    message(ws, message) {
      void handleMessage(ws, message, server);
    },

    close(ws) {
      handleClose(ws, server);
    },
  },
});

console.log(`HTTP listening on http://${server.hostname}:${server.port}`);

if (IS_DEMO_MODE) {
  console.log(`🔑 Admin secret: ${ADMIN_SECRET}`);
}

if (!IS_DEMO_MODE) {
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
}

// Simple graceful shutdown
const shutdown = async () => {
  console.log("\n⚠️ Shutting down...");

  void server.stop(); // Stop accepting new connections
  if (!IS_DEMO_MODE) {
    await BackupManager.backupState(); // Save state
  }

  process.exit(0);
};

// Handle shutdown signals
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// Crash handlers — log the error before PM2 restarts the process
process.on("uncaughtException", (error) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION — process will exit:`, error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason);
});
