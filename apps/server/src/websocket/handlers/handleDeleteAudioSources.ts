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

  // Remove all requested sources from the room's queue
  const { updated } = room.removeAudioSources(urlsToDelete);

  // Delete room-specific files from R2 storage (but keep default tracks)
  const roomPrefix = `/room-${ws.data.roomId}/`;
  const r2DeletionPromises = urlsToDelete
    .filter((url) => url.includes(roomPrefix)) // Only room-specific uploads
    .map(async (url) => {
      try {
        const key = extractKeyFromUrl(url);

        if (!key) {
          console.error(`Failed to extract key from URL: ${url}`);
          return;
        }

        await deleteObject(key);
        console.log(`🗑️ Deleted R2 object: ${key}`);
      } catch (error) {
        console.error(`Failed to delete R2 object for URL ${url}:`, error);
      }
    });

  // Wait for all R2 deletions to complete
  await Promise.all(r2DeletionPromises);

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
