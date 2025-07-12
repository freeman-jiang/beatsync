import { globalManager } from "./GlobalManager";
import {
  uploadJSON,
  downloadJSON,
  getLatestFileWithPrefix,
  getSortedFilesWithPrefix,
  deleteObject,
} from "../lib/r2";
import { z } from "zod";
import { AudioSourceSchema } from "@beatsync/shared/types/basic";

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

export class StateManager {
  private static readonly BACKUP_PREFIX = "state-backup/";

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

      for (const [roomId, roomData] of Object.entries(backupData.data.rooms)) {
        const room = globalManager.getOrCreateRoom(roomId);

        // Restore audio sources
        roomData.audioSources.forEach((source) => {
          room.addAudioSource(source);
        });

        // Schedule cleanup for rooms with no active connections
        // Use 5 minute grace period for restored rooms
        globalManager.scheduleRoomCleanup(roomId, 5 * 60 * 1000);
      }

      const ageMinutes = Math.floor(
        (Date.now() - backupData.timestamp) / 60000
      );
      console.log(
        `✅ State restored from ${ageMinutes} minutes ago:`,
        backupData
      );

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
}
