import { handleGetAudio } from "./routes/audio";
import { handleDownload } from "./routes/download";
import { handleRoot } from "./routes/root";
import { handleSearch } from "./routes/search";
import { handleStats } from "./routes/stats";
import { handleUpload } from "./routes/upload";
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

        case "/upload":
          return handleUpload(req, server);

        case "/audio":
          return handleGetAudio(req, server);

        case "/stats":
          return handleStats(req);
        
        case "/search":
          return handleSearch(req, server);

        case "/download":
          return handleDownload(req, server);

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
