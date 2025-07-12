import { listObjectsWithPrefix, deleteObjectsWithPrefix, validateR2Config } from "../lib/r2";
import { globalManager } from "../managers";
import { errorResponse, jsonResponse } from "../utils/responses";

interface CleanupResult {
  mode: "dry-run" | "live";
  orphanedRooms: {
    roomId: string;
    fileCount: number;
  }[];
  totalRooms: number;
  totalFiles: number;
  deletedFiles?: number;
  errors?: string[];
}

export async function handleCleanup(req: Request) {
  try {
    // Parse query parameters
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");
    const isLive = mode === "live";

    console.log(`🧹 Starting R2 Orphaned Room Cleanup via API`);
    console.log(`Mode: ${isLive ? "LIVE (will delete files)" : "DRY RUN (no deletions)"}\n`);

    // Validate R2 configuration
    const r2Config = validateR2Config();
    if (!r2Config.isValid) {
      return errorResponse(
        `R2 configuration is invalid: ${r2Config.errors.join(", ")}`,
        500
      );
    }

    const result: CleanupResult = {
      mode: isLive ? "live" : "dry-run",
      orphanedRooms: [],
      totalRooms: 0,
      totalFiles: 0,
      deletedFiles: 0,
      errors: []
    };

    // Step 1: Get all objects in R2
    console.log("📋 Listing all objects in R2...");
    const allObjects = await listObjectsWithPrefix("");
    
    if (!allObjects || allObjects.length === 0) {
      console.log("✅ No objects found in R2. Nothing to clean up!");
      return jsonResponse(result);
    }

    console.log(`Found ${allObjects.length} total objects in R2\n`);

    // Step 2: Group objects by room
    const roomsInR2 = new Map<string, string[]>();
    
    allObjects.forEach(obj => {
      if (obj.Key) {
        const match = obj.Key.match(/^room-([^\/]+)\//);
        if (match) {
          const roomId = match[1];
          if (!roomsInR2.has(roomId)) {
            roomsInR2.set(roomId, []);
          }
          roomsInR2.get(roomId)!.push(obj.Key);
        }
      }
    });

    console.log(`📁 Found ${roomsInR2.size} unique rooms in R2`);

    // Step 3: Get active rooms from server
    const activeRooms = new Set<string>();
    
    // Get rooms from the running server instance
    globalManager.forEachRoom((room, roomId) => {
      activeRooms.add(roomId);
    });
    console.log(`🏃 Found ${activeRooms.size} active rooms in server memory\n`);

    // Step 4: Identify orphaned rooms
    const orphanedRooms: string[] = [];
    
    roomsInR2.forEach((files, roomId) => {
      if (!activeRooms.has(roomId)) {
        orphanedRooms.push(roomId);
        result.orphanedRooms.push({
          roomId,
          fileCount: files.length
        });
      }
    });

    result.totalRooms = orphanedRooms.length;

    if (orphanedRooms.length === 0) {
      console.log("✅ No orphaned rooms found. R2 is in sync with server!");
      return jsonResponse(result);
    }

    console.log(`🗑️  Found ${orphanedRooms.length} orphaned rooms to clean up`);

    // Calculate total files to be deleted
    orphanedRooms.forEach(roomId => {
      result.totalFiles += roomsInR2.get(roomId)?.length || 0;
    });
    
    console.log(`📊 Total files to delete: ${result.totalFiles}`);

    // Step 5: Delete orphaned rooms (if live mode)
    if (isLive) {
      console.log("\n🚀 Starting deletion process...");
      
      let totalDeleted = 0;
      
      for (const roomId of orphanedRooms) {
        try {
          const deleteResult = await deleteObjectsWithPrefix(`room-${roomId}`);
          console.log(`✅ Deleted room-${roomId}: ${deleteResult.deletedCount} files`);
          totalDeleted += deleteResult.deletedCount;
        } catch (error) {
          const errorMsg = `Failed to delete room-${roomId}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          result.errors!.push(errorMsg);
        }
      }
      
      result.deletedFiles = totalDeleted;
      console.log(`\n✨ Cleanup complete!`);
      console.log(`   - Files deleted: ${totalDeleted}`);
    } else {
      console.log("\n⚠️  DRY RUN MODE - No files were deleted");
    }

    return jsonResponse(result);

  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    return errorResponse(`Cleanup failed: ${error}`, 500);
  }
}