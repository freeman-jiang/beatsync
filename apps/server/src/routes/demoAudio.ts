import { resolve } from "path";
import { AUDIO_DIR_PATH } from "@/demo";
import { corsHeaders, errorResponse } from "@/utils/responses";

export async function handleServeAudio(pathname: string): Promise<Response> {
  const filename = decodeURIComponent(pathname.slice("/audio/".length));

  // Prevent directory traversal
  const resolved = resolve(AUDIO_DIR_PATH, filename);
  if (!resolved.startsWith(AUDIO_DIR_PATH + "/")) {
    return errorResponse("Forbidden", 403);
  }

  const file = Bun.file(resolved);
  if (!(await file.exists())) {
    return errorResponse("File not found", 404);
  }

  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Content-Type": file.type,
      "Content-Length": file.size.toString(),
    },
  });
}
