import { ExtractWSRequestFrom } from "@beatsync/shared";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { generateAudioFileName, uploadFile } from "../../lib/r2";
import { MUSIC_PROVIDER_MANAGER } from "../../managers/MusicProviderManager";
import { sendUnicast } from "../../utils/responses";
import { HandlerFunction } from "../types";

export const handleStreamMusic: HandlerFunction<
  ExtractWSRequestFrom["STREAM_MUSIC"]
> = async ({ ws, message }) => {
  try {
    // Get the stream URL from the music provider
    const streamResponse = await MUSIC_PROVIDER_MANAGER.stream(message.trackId);

    if (!streamResponse.success) {
      throw new Error("Failed to get stream URL");
    }

    const roomId = ws.data.roomId;
    const streamUrl = streamResponse.data.url;

    // Use provided track name or fallback to track ID
    const originalName = message.trackName || `track-${message.trackId}`;

    // Generate a unique filename for R2
    const fileName = generateAudioFileName(`${originalName}.mp3`);

    // Download the audio file to a temporary location
    console.log(`Downloading audio from: ${streamUrl}`);
    const response = await fetch(streamUrl);

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    // Create temporary file
    const tempFilePath = join(tmpdir(), `temp-${Date.now()}-${fileName}`);
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(tempFilePath, new Uint8Array(arrayBuffer));

    try {
      // Upload to R2
      console.log(`Uploading to R2: room-${roomId}/${fileName}`);
      const r2Url = await uploadFile(tempFilePath, roomId, fileName);

      // Send success response with R2 URL
      sendUnicast({
        ws,
        message: {
          type: "STREAM_RESPONSE",
          response: {
            success: true,
            data: { url: r2Url },
          },
          trackId: message.trackId,
          trackName: message.trackName,
        },
      });

      console.log(`Successfully uploaded track to R2: ${r2Url}`);
    } finally {
      // Clean up temporary file
      try {
        await unlink(tempFilePath);
      } catch (error) {
        console.warn(`Failed to delete temporary file: ${tempFilePath}`, error);
      }
    }
  } catch (error) {
    console.error("Error in handleStreamMusic:", error);

    // Send error response
    sendUnicast({
      ws,
      message: {
        type: "STREAM_RESPONSE",
        response: {
          success: false,
          data: { url: "" },
        },
        trackId: message.trackId,
        trackName: message.trackName,
      },
    });
  }
};
