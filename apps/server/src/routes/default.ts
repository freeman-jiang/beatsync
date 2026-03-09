import { IS_DEMO_MODE } from "@/config";
import { listObjectsWithPrefix } from "@/lib/r2";
import { errorResponse, jsonResponse } from "@/utils/responses";
import type { GetDefaultAudioType } from "@beatsync/shared";

export async function handleGetDefaultAudio(_req: Request) {
  if (IS_DEMO_MODE) return jsonResponse([]);

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
