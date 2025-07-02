import { GetAudioSchema } from "@beatsync/shared";
import { Server } from "bun";
import { errorResponse } from "../utils/responses";
import { getPublicAudioUrl } from "../lib/r2";

export const handleGetAudio = async (req: Request, _server: Server) => {
  try {
    // Check if it's a POST request
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    // Check content type
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return errorResponse("Content-Type must be application/json", 400);
    }

    // Parse and validate the request body
    const rawBody = await req.json();
    const parseResult = GetAudioSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return errorResponse(
        `Invalid request data: ${parseResult.error.message}`,
        400
      );
    }

    const { id } = parseResult.data;

    // Parse room ID and filename from the file ID
    // ID format: "room-{roomId}/{fileName}"
    const parts = id.split('/');
    if (parts.length !== 2 || !parts[0].startsWith('room-')) {
      return errorResponse("Invalid file ID format", 400);
    }

    const roomId = parts[0].substring(5); // Remove "room-" prefix
    const fileName = parts[1];

    // Generate R2 public URL and redirect
    const publicUrl = getPublicAudioUrl(roomId, fileName);
    
    // Return a redirect to the R2 public URL
    return new Response(null, {
      status: 302,
      headers: {
        "Location": publicUrl,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error handling audio request:", error);
    return errorResponse("Failed to process audio request", 500);
  }
};
