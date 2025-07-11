import { globalManager } from "./GlobalManager";
import {
  uploadJSON,
  downloadJSON,
  getLatestFileWithPrefix,
  getSortedFilesWithPrefix,
  deleteObject,
} from "../lib/r2";

interface BackupState {
  version: number;
  timestamp: number;
  data: {
    rooms: Record<
      string,
      {
        clients: Array<{
          clientId: string;
          username: string;
        }>;
        audioSources: Array<{ url: string }>;
      }
    >;
  };
}

export class StateManager {
  private static readonly BACKUP_PREFIX = "state-backup/";
  private static readonly CURRENT_VERSION = 1;

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
        version: this.CURRENT_VERSION,
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
      const backupData = await downloadJSON<BackupState>(latestBackupKey);

      if (!backupData) {
        throw new Error("Failed to read backup data");
      }

      // Check version compatibility
      if (backupData.version > this.CURRENT_VERSION) {
        throw new Error(
          `Backup version ${backupData.version} is newer than current version ${this.CURRENT_VERSION}`
        );
      }

      // Restore rooms
      const rooms = backupData.data.rooms;
      let restoredRooms = 0;
      let restoredClients = 0;

      for (const [roomId, roomData] of Object.entries(rooms)) {
        const room = globalManager.getOrCreateRoom(roomId);

        // Restore audio sources
        roomData.audioSources.forEach((source) => {
          room.addAudioSource(source);
        });

        // Note: We don't restore clients as they need active WebSocket connections
        // This is just for logging purposes
        restoredClients += roomData.clients.length;
        restoredRooms++;
      }

      const ageMinutes = Math.floor(
        (Date.now() - backupData.timestamp) / 60000
      );
      console.log(
        `✅ State restored: ${restoredRooms} rooms, ${restoredClients} clients (backup age: ${ageMinutes} minutes)`
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
