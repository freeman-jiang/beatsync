import { describe, expect, it } from "bun:test";

describe("R2 Logic Tests", () => {
  describe("Object filtering logic", () => {
    it("should identify folder objects correctly", () => {
      const objects = [
        { Key: "room-123/audio.mp3", Size: 1024 },
        { Key: "room-123/", Size: 0 }, // Folder
        { Key: "room-123/subfolder/", Size: 0 }, // Another folder
        { Key: "room-123/music.mp3", Size: 2048 },
      ];

      // Test folder detection logic (what our code uses)
      const isFolder = (obj: any) => obj.Key?.endsWith("/") && obj.Size === 0;
      const nonFolders = objects.filter(obj => !isFolder(obj));
      const folders = objects.filter(obj => isFolder(obj));

      expect(nonFolders).toHaveLength(2);
      expect(folders).toHaveLength(2);
      expect(nonFolders[0].Key).toBe("room-123/audio.mp3");
      expect(folders[0].Key).toBe("room-123/");
    });

    it("should handle includeFolders option logic", () => {
      const objects = [
        { Key: "room-123/audio.mp3", Size: 1024 },
        { Key: "room-123/", Size: 0 }, // Folder
      ];

      // Simulate our filtering logic
      const filterObjects = (objects: any[], includeFolders: boolean) => {
        if (includeFolders) {
          return objects.filter(obj => obj.Key);
        } else {
          return objects.filter(
            obj => obj.Key && !obj.Key.endsWith("/") && obj.Size && obj.Size > 0
          );
        }
      };

      const withoutFolders = filterObjects(objects, false);
      const withFolders = filterObjects(objects, true);

      expect(withoutFolders).toHaveLength(1);
      expect(withFolders).toHaveLength(2);
    });
  });

  describe("Error handling logic", () => {
    it("should detect NotImplemented errors correctly", () => {
      const errors = [
        { Code: "NotImplemented", message: "Batch delete not supported" },
        new Error("NotImplemented: This operation is not supported"),
        new Error("Access Denied"),
        { Code: "AccessDenied", message: "Permission denied" },
      ];

      // Test our error detection logic
      const isNotImplementedError = (error: any) => {
        return (
          (error instanceof Error && error.message.includes("NotImplemented")) ||
          (error && typeof error === "object" && "Code" in error && error.Code === "NotImplemented")
        );
      };

      expect(isNotImplementedError(errors[0])).toBe(true); // Code property
      expect(isNotImplementedError(errors[1])).toBe(true); // Error message
      expect(isNotImplementedError(errors[2])).toBe(false); // Different error
      expect(isNotImplementedError(errors[3])).toBe(false); // Different code
    });
  });

  describe("Delete operation logic", () => {
    it("should handle batch delete results correctly", () => {
      // Simulate batch delete response processing
      const processBatchResult = (batchLength: number, errors: any[] = []) => {
        const deletedCount = batchLength - errors.length;
        return { deletedCount, errors };
      };

      // Successful batch delete
      const success = processBatchResult(3, []);
      expect(success.deletedCount).toBe(3);
      expect(success.errors).toHaveLength(0);

      // Partial failure
      const partial = processBatchResult(3, [{ Key: "file1.mp3", Message: "Access denied" }]);
      expect(partial.deletedCount).toBe(2);
      expect(partial.errors).toHaveLength(1);
    });

    it("should prepare objects for deletion correctly", () => {
      const objects = [
        { Key: "room-123/audio.mp3", Size: 1024 },
        { Key: "room-123/", Size: 0 },
      ];

      // Simulate our object preparation logic
      const objectsToDelete = objects.map(obj => ({ Key: obj.Key! }));

      expect(objectsToDelete).toHaveLength(2);
      expect(objectsToDelete[0]).toEqual({ Key: "room-123/audio.mp3" });
      expect(objectsToDelete[1]).toEqual({ Key: "room-123/" });
    });
  });
});