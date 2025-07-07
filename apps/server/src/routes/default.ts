import { AudioSourceType, GetDefaultAudioType } from "@beatsync/shared";
import { listObjectsWithPrefix } from "../lib/r2";
import { jsonResponse, errorResponse } from "../utils/responses";

export async function handleGetDefaultAudio(_req: Request) {
  try {
    // List all objects with "default/" prefix
    const objects = await listObjectsWithPrefix("default/");

    if (!objects || objects.length === 0) {
      return jsonResponse([]);
    }

    // Map to array of objects with public URLs
    const response: GetDefaultAudioType = objects.map((obj) => ({
      url: `${process.env.S3_PUBLIC_URL}/${obj.Key}`,
    }));

    return jsonResponse(response);
  } catch (error) {
    console.error("Failed to list default audio files:", error);
    return errorResponse("Failed to list default audio files", 500);
  }
}
