import * as os from "os";
import { globalManager } from "../managers";
import { formatBytes, getBlobStats } from "../utils/blobStats";
import { corsHeaders } from "../utils/responses";

export async function handleStats(): Promise<Response> {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = process.memoryUsage(); // rss, heapTotal, heapUsed, external, arrayBuffers

  const stats = {
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

    // Get detailed client information including location
    const clients = room.getClients().map((client) => ({
      clientId: client.clientId,
      username: client.username,
      isAdmin: client.isAdmin,
      rtt: client.rtt,
      location: client.location ?? null,
    }));

    return {
      ...roomStats,
      fileCount: storageInfo?.fileCount || 0,
      totalSize: storageInfo?.totalSize || "0 B",
      totalSizeBytes: storageInfo?.totalSizeBytes || 0,
      files: storageInfo?.files || [],
      clients, // Add detailed client information
    };
  });

  // Sort rooms by client count (most clients first), then by total size
  activeRooms.sort((a, b) => {
    if (b.clientCount !== a.clientCount) {
      return b.clientCount - a.clientCount;
    }
    return b.totalSizeBytes - a.totalSizeBytes;
  });

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
