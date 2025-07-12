import { RoomManager } from "./RoomManager";

/**
 * GlobalManager is a singleton that manages all active rooms.
 * It handles room creation, deletion, and provides access to individual room managers.
 */

const CLEANUP_DELAY_MS = 1000 * 60; // 60 seconds
export class GlobalManager {
  private rooms = new Map<string, RoomManager>();

  /**
   * Get a room by its ID
   */
  getRoom(roomId: string): RoomManager | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get or create a room. If the room doesn't exist, it will be created.
   */
  getOrCreateRoom(roomId: string): RoomManager {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new RoomManager(roomId);
      this.rooms.set(roomId, room);
      console.log(`Room ${roomId} created`);
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
