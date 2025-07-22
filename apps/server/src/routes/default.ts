import { getDefaultAudioSources } from "../lib/r2";
import { errorResponse, jsonResponse } from "../utils/responses";

export async function handleGetDefaultAudio(_req: Request) {
  try {
    // List all objects with "default/" prefix
    const urls = await getDefaultAudioSources("default/");
    return jsonResponse(urls);
  } catch (error) {
    console.error("Failed to list default audio files:", error);
    return errorResponse("Failed to list default audio files", 500);
  }
}
