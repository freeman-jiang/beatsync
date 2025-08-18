import type { ClientDataType } from "@beatsync/shared";
import { R2_AUDIO_FILE_NAME_DELIMITER } from "@beatsync/shared";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the oldest client in a room (first to join based on joinedAt timestamp)
 */
export function getOldestClient(clients: ClientDataType[]): ClientDataType {
  if (!clients || clients.length === 0) {
    throw new Error("No clients provided");
  }

  return [...clients].sort((a, b) => a.joinedAt - b.joinedAt)[0];
}

/**
 * Format time in seconds to MM:SS format
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export const trimFileName = (fileName: string) => {
  // Remove file extensions like .mp3, .wav, etc.
  return fileName.replace(/\.[^/.]+$/, "");
};

export const extractFileNameFromUrl = (url: string) => {
  // Get everything after the last slash
  const parts = url.split("/");
  if (parts.length > 1) {
    const encodedFileName = parts[parts.length - 1];

    // Decode the URL-encoded filename to get the original characters
    const fullFileName = decodeURIComponent(encodedFileName);

    // Extract the original filename by splitting on the delimiter
    // Format: originalName___timestamp.extension
    const delimiterIndex = fullFileName.indexOf(R2_AUDIO_FILE_NAME_DELIMITER);
    if (delimiterIndex !== -1) {
      // Get the original name before the delimiter
      return fullFileName.substring(0, delimiterIndex);
    }

    // Fallback to trimming extension if no delimiter found (default files will be like this)
    return trimFileName(fullFileName);
  }

  throw new Error(`Invalid URL: ${url}`);
};
