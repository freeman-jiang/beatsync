import { getPublicAudioUrl, listObjectsWithPrefix } from "../lib/r2";
import { globalManager } from "../managers";

// Helper function to format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Type definitions
interface FileInfo {
  key: string;
  size: string;
  sizeBytes: number;
  publicUrl: string;
}

interface RoomDetail {
  fileCount: number;
  totalSize: string;
  totalSizeBytes: number;
  files: FileInfo[];
}

interface BlobStats {
  error?: string;
  totalObjects: number;
  totalRooms: number;
  totalSize: string;
  totalSizeBytes: number;
  activeRooms: Record<string, RoomDetail>;
  orphanedRooms: Record<string, RoomDetail>;
  orphanedCount: number;
}

export async function getBlobStats(): Promise<BlobStats> {
  try {
    const allObjects = await listObjectsWithPrefix("");

    // Group objects by room and calculate sizes
    const roomsInStorage = new Map<
      string,
      { files: any[]; totalSize: number }
    >();
    let totalStorageSize = 0;

    if (allObjects) {
      allObjects.forEach((obj) => {
        if (obj.Key) {
          const match = obj.Key.match(/^room-([^\/]+)\//);
          if (match) {
            const roomId = match[1];
            if (!roomsInStorage.has(roomId)) {
              roomsInStorage.set(roomId, { files: [], totalSize: 0 });
            }
            const room = roomsInStorage.get(roomId)!;
            room.files.push(obj);
            room.totalSize += obj.Size || 0;
            totalStorageSize += obj.Size || 0;
          }
        }
      });
    }

    // Get active rooms from server
    const activeRoomSet = new Set(globalManager.getRoomIds());

    // Separate active rooms from orphaned rooms
    const activeRoomDetails: Record<string, RoomDetail> = {};
    const orphanedRoomDetails: Record<string, RoomDetail> = {};

    roomsInStorage.forEach((roomData, roomId) => {
      // Extract filename from the key (room-{roomId}/{filename})
      const files = roomData.files.map((obj) => {
        const filename = obj.Key.split("/").pop() || "";
        return {
          key: obj.Key,
          size: formatBytes(obj.Size || 0),
          sizeBytes: obj.Size || 0,
          publicUrl: getPublicAudioUrl(roomId, filename),
        };
      });

      const roomDetail = {
        fileCount: roomData.files.length,
        totalSize: formatBytes(roomData.totalSize),
        totalSizeBytes: roomData.totalSize,
        files: files,
      };

      // Separate active from orphaned
      if (activeRoomSet.has(roomId)) {
        activeRoomDetails[roomId] = roomDetail;
      } else {
        orphanedRoomDetails[roomId] = roomDetail;
      }
    });

    const orphanedCount = Object.keys(orphanedRoomDetails).length;

    return {
      totalObjects: allObjects?.length || 0,
      totalRooms: roomsInStorage.size,
      totalSize: formatBytes(totalStorageSize),
      totalSizeBytes: totalStorageSize,
      activeRooms: activeRoomDetails,
      orphanedRooms: orphanedRoomDetails,
      orphanedCount,
    };
  } catch (error) {
    return {
      error: `Failed to check blob storage: ${error}`,
      totalObjects: 0,
      totalRooms: 0,
      totalSize: "0 B",
      totalSizeBytes: 0,
      activeRooms: {},
      orphanedRooms: {},
      orphanedCount: 0,
    };
  }
}
