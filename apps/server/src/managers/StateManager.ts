import { globalManager } from "./GlobalManager";
import {
  uploadJSON,
  downloadJSON,
  getLatestFileWithPrefix,
  getSortedFilesWithPrefix,
  deleteObject,
  cleanupOrphanedRooms,
} from "../lib/r2";
import { z } from "zod";
import { AudioSourceSchema } from "@beatsync/shared/types/basic";
import pLimit from "p-limit";

// Define Zod schemas for backup validation
const BackupClientSchema = z.object({
  clientId: z.string(),
  username: z.string(),
});

const BackupRoomSchema = z.object({
  clients: z.array(BackupClientSchema),
  audioSources: z.array(AudioSourceSchema),
});

const BackupStateSchema = z.object({
  timestamp: z.number(),
  data: z.object({
    rooms: z.record(z.string(), BackupRoomSchema),
  }),
});

type BackupState = z.infer<typeof BackupStateSchema>;

interface RoomRestoreResult {
  roomId: string;
  success: boolean;
  error?: string;
}

export class StateManager {
  private static readonly BACKUP_PREFIX = "state-backup/";
  private static readonly DEFAULT_RESTORE_CONCURRENCY = 1000;

  /**
   * Restore a single room from backup data
   */
  private static async restoreRoom(
    roomId: string,
    roomData: z.infer<typeof BackupRoomSchema>
  ): Promise<RoomRestoreResult> {
    try {
      const room = globalManager.getOrCreateRoom(roomId);

      // Restore audio sources
      roomData.audioSources.forEach((source) => {
        room.addAudioSource(source);
      });

      // Schedule cleanup for rooms with no active connections
      globalManager.scheduleRoomCleanup(roomId);

      return { roomId, success: true };
    } catch (error) {
      console.error(`❌ Failed to restore room ${roomId}:`, error);
      return {
        roomId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a timestamped backup filename
   */
  private static generateBackupFilename(): string {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, -5);
    return `${this.BACKUP_PREFIX}backup-${timestamp}.json`;
  }

  /**
   * Save the current server state to R2
   */
  static async backupState(): Promise<void> {
    try {
      console.log("🔄 Starting state backup...");

      // Collect state from all rooms
      const rooms: BackupState["data"]["rooms"] = {};

      globalManager.forEachRoom((room, roomId) => {
        rooms[roomId] = room.getBackupState();
      });

      const backupData: BackupState = {
        timestamp: Date.now(),
        data: { rooms },
      };

      const filename = this.generateBackupFilename();

      // Upload to R2 using the utility function
      await uploadJSON(filename, backupData);

      console.log(
        `✅ State backup completed: ${filename} (${
          rooms ? Object.keys(rooms).length : 0
        } rooms)`
      );

      // Clean up old backups after successful backup
      await this.cleanupOldBackups();
    } catch (error) {
      console.error("❌ State backup failed:", error);
      throw error;
    }
  }

  /**
   * Restore server state from the latest backup in R2
   */
  static async restoreState(): Promise<boolean> {
    try {
      console.log("🔍 Looking for state backups...");

      // Get the latest backup file
      const latestBackupKey = await getLatestFileWithPrefix(this.BACKUP_PREFIX);

      if (!latestBackupKey) {
        console.log("📭 No backups found");

        // Still clean up orphaned rooms even if no backup exists
        await this.cleanupOrphanedRooms();

        return false;
      }

      console.log(`📥 Restoring from: ${latestBackupKey}`);

      // Download and parse the backup
      const rawBackupData = await downloadJSON(latestBackupKey);

      if (!rawBackupData) {
        throw new Error("Failed to read backup data");
      }

      // Validate backup data with Zod schema
      const parseResult = BackupStateSchema.safeParse(rawBackupData);

      if (!parseResult.success) {
        throw new Error(
          `Invalid backup data format: ${parseResult.error.message}`
        );
      }

      const backupData = parseResult.data;

      // Get configurable concurrency limit
      const concurrency = this.DEFAULT_RESTORE_CONCURRENCY;
      const limit = pLimit(concurrency);

      const roomEntries = Object.entries(backupData.data.rooms);
      console.log(
        `🔄 Restoring ${roomEntries.length} rooms with concurrency limit of ${concurrency}...`
      );

      // Process rooms in parallel with concurrency control using p-limit
      const restorePromises = roomEntries.map(([roomId, roomData]) =>
        limit(() => this.restoreRoom(roomId, roomData))
      );

      const results = await Promise.allSettled(restorePromises);

      // Analyze results
      const successful: RoomRestoreResult[] = [];
      const failed: RoomRestoreResult[] = [];

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            successful.push(result.value);
          } else {
            failed.push(result.value);
          }
        } else {
          // This shouldn't happen since we catch errors in restoreRoom, but handle it just in case
          failed.push({
            roomId: "unknown",
            success: false,
            error: result.reason?.message || "Unknown error",
          });
        }
      });

      const ageMinutes = Math.floor(
        (Date.now() - backupData.timestamp) / 60000
      );

      console.log(
        `✅ State restoration completed from ${ageMinutes} minutes ago:`
      );
      console.log(`   - Successfully restored: ${successful.length} rooms`);

      if (failed.length > 0) {
        console.log(`   - Failed to restore: ${failed.length} rooms`);
        failed.forEach((failure) => {
          console.log(`     ❌ ${failure.roomId}: ${failure.error}`);
        });
      }

      // Clean up orphaned rooms after state restore
      await this.cleanupOrphanedRooms();

      return true;
    } catch (error) {
      console.error("❌ State restore failed:", error);
      return false;
    }
  }

  /**
   * Clean up old backups (keep last N backups)
   */
  static async cleanupOldBackups(keepCount: number = 5): Promise<void> {
    try {
      // Get all backup files sorted by name (newest first)
      const backupFiles = await getSortedFilesWithPrefix(
        this.BACKUP_PREFIX,
        ".json"
      );

      if (backupFiles.length <= keepCount) {
        return; // Nothing to clean up
      }

      // Identify files to delete (everything after the first keepCount)
      const filesToDelete = backupFiles.slice(keepCount);

      console.log(`🧹 Cleaning up ${filesToDelete.length} old backup(s)...`);

      // Delete old backups
      for (const fileKey of filesToDelete) {
        try {
          await deleteObject(fileKey);
          console.log(`  🗑️ Deleted: ${fileKey}`);
        } catch (error) {
          console.error(`  ❌ Failed to delete ${fileKey}:`, error);
        }
      }

      console.log(
        `✅ Cleanup completed. Kept ${keepCount} most recent backups.`
      );
    } catch (error) {
      // Don't throw - cleanup failures shouldn't break the backup process
      console.error("⚠️ Backup cleanup failed (non-critical):", error);
    }
  }

  /**
   * Clean up orphaned rooms that exist in R2 but not in server memory
   */
  static async cleanupOrphanedRooms(): Promise<void> {
    try {
      console.log("🧹 Cleaning up orphaned rooms...");

      const activeRooms = new Set<string>(globalManager.getRoomIds());
      const cleanupResult = await cleanupOrphanedRooms(activeRooms, true);

      if (cleanupResult.totalRooms > 0) {
        console.log(
          `✅ Orphan cleanup completed: deleted ${cleanupResult.deletedFiles} files from ${cleanupResult.totalRooms} orphaned rooms`
        );
      } else {
        console.log("✅ No orphaned rooms found");
      }
    } catch (error) {
      // Don't throw - cleanup failures shouldn't break the restore process
      console.error("⚠️ Orphaned room cleanup failed:", error);
    }
  }
}
