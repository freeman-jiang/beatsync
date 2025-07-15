import { cleanupOrphanedRooms, OrphanCleanupResult } from "../lib/r2";
import { globalManager } from "../managers";
import { errorResponse, jsonResponse } from "../utils/responses";

interface CleanupResult extends OrphanCleanupResult {
  mode: "dry-run" | "live";
}

export async function handleCleanup(req: Request) {
  try {
    // Parse query parameters
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");
    const isLive = mode === "live";

    console.log(`🧹 Starting R2 Orphaned Room Cleanup via API`);
    console.log(`Mode: ${isLive ? "LIVE (will delete files)" : "DRY RUN (no deletions)"}\n`);

    // Get active rooms from server
    const activeRooms = new Set<string>();
    globalManager.forEachRoom((room, roomId) => {
      activeRooms.add(roomId);
    });

    // Use the shared cleanup function
    const cleanupResult = await cleanupOrphanedRooms(activeRooms, isLive);

    const result: CleanupResult = {
      mode: isLive ? "live" : "dry-run",
      ...cleanupResult
    };

    return jsonResponse(result);

  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    return errorResponse(`Cleanup failed: ${error}`, 500);
  }
}