import { ExtractWSRequestFrom } from "@beatsync/shared";
import { generateAudioFileName, uploadBytes } from "../../lib/r2";
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

    // Download the audio file
    console.log(`Downloading audio from: ${streamUrl}`);
    const response = await fetch(streamUrl);

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    // Get audio bytes
    const arrayBuffer = await response.arrayBuffer();
    
    // Get content type from response headers, fallback to audio/mpeg
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    // Upload directly to R2
    console.log(`Uploading to R2: room-${roomId}/${fileName}`);
    const r2Url = await uploadBytes(arrayBuffer, roomId, fileName, contentType);

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
