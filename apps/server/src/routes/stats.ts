import type { CpuInfo } from "os";
import * as os from "os";
import { globalManager } from "../managers";
import { formatBytes, getBlobStats } from "../utils/blobStats";
import { corsHeaders } from "../utils/responses";

export async function handleStats(): Promise<Response> {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = process.memoryUsage(); // rss, heapTotal, heapUsed, external, arrayBuffers

  const stats = {
    cpu: {
      count: cpus.length,
      cores: cpus.map((core: CpuInfo) => ({
        model: core.model,
        speed: core.speed,
      })),
    },
    memory: {
      total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
      process: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
        arrayBuffers: `${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(
          2
        )} MB`,
      },
    },
  };

  // --- Get Blob Storage Stats ---
  const blobStats = await getBlobStats();

  // --- Add Room Manager Stats with enriched storage info ---
  const activeRooms = globalManager.getRooms().map(([roomId, room]) => {
    const roomStats = room.getStats();
    const storageInfo = blobStats.activeRooms[roomId];
    return {
      ...roomStats,
      fileCount: storageInfo?.fileCount || 0,
      totalSize: storageInfo?.totalSize || "0 B",
      totalSizeBytes: storageInfo?.totalSizeBytes || 0,
      files: storageInfo?.files || [],
    };
  });

  // Sort rooms by total size (largest first)
  activeRooms.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

  // Calculate totals for active rooms
  const activeRoomsTotalSize = activeRooms.reduce(
    (sum, room) => sum + room.totalSizeBytes,
    0
  );
  const activeRoomsTotalFiles = activeRooms.reduce(
    (sum, room) => sum + room.fileCount,
    0
  );

  // Calculate totals for orphaned rooms
  const orphanedRoomsArray = Object.entries(blobStats.orphanedRooms).map(
    ([roomId, data]) => ({
      roomId,
      ...data,
    })
  );
  const orphanedRoomsTotalSize = orphanedRoomsArray.reduce(
    (sum, room) => sum + room.totalSizeBytes,
    0
  );
  const orphanedRoomsTotalFiles = orphanedRoomsArray.reduce(
    (sum, room) => sum + room.fileCount,
    0
  );

  // --- Combine stats ---
  const combinedStats = {
    ...stats, // Existing CPU and Memory stats
    status: {
      totalObjects: blobStats.totalObjects,
      totalSize: blobStats.totalSize,
      totalSizeBytes: blobStats.totalSizeBytes,
      activeRooms: {
        total: activeRooms.length,
        totalFiles: activeRoomsTotalFiles,
        totalSize: formatBytes(activeRoomsTotalSize),
        totalSizeBytes: activeRoomsTotalSize,
        rooms: activeRooms,
      },
      orphanedRooms: {
        total: blobStats.orphanedCount,
        totalFiles: orphanedRoomsTotalFiles,
        totalSize: formatBytes(orphanedRoomsTotalSize),
        totalSizeBytes: orphanedRoomsTotalSize,
        rooms: blobStats.orphanedRooms,
      },
    },
  };

  return new Response(JSON.stringify(combinedStats), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
