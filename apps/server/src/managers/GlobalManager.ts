import { RoomManager } from "./RoomManager";

/**
 * GlobalManager is a singleton that manages all active rooms.
 * It handles room creation, deletion, and provides access to individual room managers.
 */
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
   * Delete a room and clean up its resources
   */
  async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      await room.cleanup();
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
}

// Export singleton instance
export const globalManager = new GlobalManager();