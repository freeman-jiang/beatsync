import type { Server } from "bun";
import { errorResponse, jsonResponse, sendBroadcast } from "../utils/responses";
import { DownloadTrackSchema } from "@beatsync/shared";
import { DOWNLOAD_SERVICE } from "../download/dab";

export const handleDownload = async (req: Request, server: Server) => {
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

    // Parse and validate the request body using Zod schema
    const rawBody = await req.json();
    const parseResult = DownloadTrackSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return errorResponse(
        `Invalid request data: ${parseResult.error.message}`,
        400,
      );
    }

    const roomId: string = parseResult.data.roomId;
    const title = parseResult.data.name;
    const fileId = await DOWNLOAD_SERVICE.download(
      parseResult.data.trackId,
      title,
      roomId,
    );

    sendBroadcast({
      server,
      roomId,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "NEW_AUDIO_SOURCE",
          id: fileId,
          title, // Keep original name for display
          duration: 1, // TODO: lol calculate this later properly
          addedAt: Date.now(),
          addedBy: roomId,
        },
      },
    });

    // Return success response with the file details
    return jsonResponse({
      success: true,
    }); // Wait for the broadcast to be received.
  } catch (error) {
    console.error("Error handling track download:", error);
    return errorResponse("Failed to process track download", 500);
  }
};
