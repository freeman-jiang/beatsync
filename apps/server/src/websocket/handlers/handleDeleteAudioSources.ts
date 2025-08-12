import { ExtractWSRequestFrom } from "@beatsync/shared";
import { deleteObject, extractKeyFromUrl } from "../../lib/r2";
import { sendBroadcast } from "../../utils/responses";
import { requireCanMutate } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleDeleteAudioSources: HandlerFunction<
  ExtractWSRequestFrom["DELETE_AUDIO_SOURCES"]
> = async ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  // Get current URLs to validate the request
  const currentUrls = new Set(room.getState().audioSources.map((s) => s.url));

  // Only process URLs that actually exist in the room
  const urlsToDelete = message.urls.filter((url) => currentUrls.has(url));

  if (urlsToDelete.length === 0) {
    return; // nothing to do, silent idempotency
  }

  // First, attempt to delete room-specific files from R2 storage
  // Track which URLs were successfully deleted from R2
  const successfullyDeletedUrls = new Set<string>();
  const roomPrefix = `/room-${ws.data.roomId}/`;

  // Process R2 deletions and track successes
  const r2DeletionPromises = urlsToDelete.map(async (url) => {
    // Always add non-R2 URLs (like default tracks) to successful list
    if (!url.includes(roomPrefix)) {
      successfullyDeletedUrls.add(url); // Just say we've processed it
      return;
    }

    // Otherwise we need to actually delete the file from R2
    try {
      const key = extractKeyFromUrl(url);

      if (!key) {
        throw new Error(`Failed to extract key from URL: ${url}`);
      }

      await deleteObject(key);
      console.log(`🗑️ Deleted R2 object: ${key}`);
      successfullyDeletedUrls.add(url);
    } catch (error) {
      console.error(`Failed to delete R2 object for URL ${url}:`, error);
      // Don't add to successfullyDeletedUrls - keep in room state
    }
  });

  // Wait for all R2 deletion attempts to complete
  await Promise.all(r2DeletionPromises);

  // Only remove successfully deleted URLs from the room's queue
  const urlsToRemove = Array.from(successfullyDeletedUrls);

  if (urlsToRemove.length === 0) {
    console.log(
      "No URLs were successfully deleted from R2, keeping all in queue"
    );
    return;
  }

  // Remove only the successfully deleted sources from room state
  const { updated } = room.removeAudioSources(urlsToRemove);

  // Broadcast updated queue to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: updated },
    },
  });
};
