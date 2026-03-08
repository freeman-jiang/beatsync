import { resolve } from "path";
import { DEMO_AUDIO_DIR } from "@/config";
import { corsHeaders, errorResponse } from "@/utils/responses";

export async function handleServeAudio(pathname: string): Promise<Response> {
  const filename = decodeURIComponent(pathname.slice("/audio/".length));

  // Prevent directory traversal
  const resolved = resolve(DEMO_AUDIO_DIR, filename);
  if (!resolved.startsWith(DEMO_AUDIO_DIR + "/")) {
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
