import { ExtractWSRequestFrom } from "@beatsync/shared";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";
import { sendUnicast, sendBroadcast } from "../../utils/responses";
import { globalManager } from "../../managers";
import { 
  isValidYouTubeUrl, 
  youtubeDownloadManager,
  YoutubeDownloadProgress 
} from "../../lib/youtube";

export const handleYouTubeDownload: HandlerFunction<
  ExtractWSRequestFrom["YOUTUBE_DOWNLOAD"]
> = async ({ ws, message, server }) => {
  requireRoom(ws); // Ensure client is in a valid room
  
  try {
    // Validate YouTube URL
    if (!isValidYouTubeUrl(message.url)) {
      return sendUnicast({
        ws,
        message: {
          type: "YOUTUBE_DOWNLOAD_RESPONSE",
          success: false,
          error: "Invalid YouTube URL"
        }
      });
    }

    // Start download job
    const jobId = await youtubeDownloadManager.startDownload(
      message.url,
      ws.data.roomId,
      (jobId: string, progress: YoutubeDownloadProgress) => {
        // Broadcast progress to all clients in the room
        sendBroadcast({
          server,
          roomId: ws.data.roomId,
          message: {
            type: "YOUTUBE_DOWNLOAD_PROGRESS",
            jobId,
            progress
          }
        });

        // If download completed successfully, add audio source to room
        if (progress.status === "completed" && progress.audioUrl) {
          const room = globalManager.getRoom(ws.data.roomId);
          if (room) {
            const sources = room.addAudioSource({ url: progress.audioUrl });
            
            console.log(
              `✅ YouTube download completed - broadcasting to room ${ws.data.roomId} new sources: ${sources.length}`
            );

            // Broadcast new audio sources to all clients in the room
            sendBroadcast({
              server,
              roomId: ws.data.roomId,
              message: {
                type: "ROOM_EVENT",
                event: {
                  type: "SET_AUDIO_SOURCES",
                  sources,
                },
              },
            });
          }
        }
      }
    );

    // Send success response back to requesting client
    sendUnicast({
      ws,
      message: {
        type: "YOUTUBE_DOWNLOAD_RESPONSE",
        success: true,
        jobId,
        message: "Download started"
      }
    });

  } catch (error) {
    console.error("YouTube download error:", error);
    sendUnicast({
      ws,
      message: {
        type: "YOUTUBE_DOWNLOAD_RESPONSE",
        success: false,
        error: error instanceof Error ? error.message : "Download failed"
      }
    });
  }
};