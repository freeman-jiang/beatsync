import { RoomManager } from "./RoomManager";

/**
 * GlobalManager is a singleton that manages all active rooms.
 * It handles room creation, deletion, and provides access to individual room managers.
 */

const CLEANUP_DELAY_MS = 1000 * 60; // 60 seconds
export class GlobalManager {
  private rooms = new Map<string, RoomManager>();

  // Active user count cache
  private activeUserCount: number = 0;
  private isDirty: boolean = true;
  private isCalculating: boolean = false;

  /**
   * Get a room by its ID
   */
  getRoom(roomId: string): RoomManager | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get or create a room. If the room doesn't exist, it will be created.
   * This is asynchronous because at the moment of creation the room gets all the default audios
   */
  async getOrCreateRoom(roomId: string): Promise<RoomManager> {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = await RoomManager.create({
        roomId,
        onClientCountChange: () => this.isDirty = true,
      });
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /**
   * Delete a room from the map
   */
  async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      this.rooms.delete(roomId);
      console.log(`Room ${roomId} deleted from GlobalManager`);
    }
  }

  /**
   * Get all active rooms as [roomId, room] pairs
   */
  getRooms(): [string, RoomManager][] {
    return Array.from(this.rooms.entries());
  }

  /**
   * Get the count of active rooms
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Check if a room exists
   */
  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Iterate over all rooms
   */
  forEachRoom(callback: (room: RoomManager, roomId: string) => void): void {
    this.rooms.forEach(callback);
  }

  /**
   * Get all room IDs
   */
  getRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Mark the active user count cache as dirty.
   * This should be called whenever room client counts change.
   */
  markActiveUserCountDirty(): void {
    this.isDirty = true;
  }

  /**
   * Get the total number of active users across all rooms, using a cache.
   * Recalculates the count only if the cache is dirty.
   */
  async getActiveUserCount(): Promise<number> {
    // If the cache is fresh, return it immediately
    if (!this.isDirty) {
      return this.activeUserCount;
    }

    // If another process is already calculating, return the current value
    // This prevents request pile-ups and race conditions
    if (this.isCalculating) {
      return this.activeUserCount;
    }

    // We are the first to arrive, so we'll do the calculation
    this.isCalculating = true;

    console.log("Calculating active user count");

    try {
      // Calculate fresh count by summing clients from all rooms
      const newCount = Array.from(this.rooms.values()).reduce(
        (acc, room) => acc + room.getNumClients(),
        0
      );

      this.activeUserCount = newCount;
      this.isDirty = false;
    } catch (error) {
      console.error("Failed to recalculate active user count:", error);
      // Keep cache dirty to retry next time
    } finally {
      // Always release the lock
      this.isCalculating = false;
    }

    return this.activeUserCount;
  }

  /**
   * Schedule cleanup for a room if it has no active connections
   */
  scheduleRoomCleanup(roomId: string): void {
    const room = this.getRoom(roomId);
    if (!room) {
      console.warn(`Cannot schedule cleanup for non-existent room: ${roomId}`);
      return;
    }

    // Only schedule cleanup if room has no active connections
    if (!room.hasActiveConnections()) {
      room.scheduleCleanup(async () => {
        // Re-check if room still has no active connections when timer fires
        const currentRoom = this.getRoom(roomId);
        if (currentRoom && !currentRoom.hasActiveConnections()) {
          await currentRoom.cleanup();
          await this.deleteRoom(roomId);
        } else {
          console.log(
            `Room ${roomId} has active connections now, skipping cleanup.`
          );
        }
      }, CLEANUP_DELAY_MS);
    }
  }
}

// Export singleton instance
export const globalManager = new GlobalManager();
