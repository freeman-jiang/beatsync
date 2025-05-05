import type {
  Pagination,
  DABTrack as Track,
} from "@beatsync/shared/types/schemas/dab";
import { AUDIO_DIR } from "../config";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { DownloadService, SearchResult, SearchService } from "./interface";

/**
 * Dab Music service that implements search and download functionality.
 */
class DabMusicService implements SearchService, DownloadService {
  async search(query: string, offset: number): Promise<SearchResult> {
    const urlEncoded = encodeURIComponent(query);
    console.log("Searching for ", urlEncoded);
    const { tracks, pagination }: { tracks: Track[]; pagination: Pagination } =
      await fetch(
        `https://dab.yeet.su/api/search?q=${urlEncoded}&offset=${offset}&type=track`,
        {
          credentials: "include",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Sec-GPC": "1",
            "Alt-Used": "dab.yeet.su",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            Priority: "u=0",
          },
          referrer: "https://dab.yeet.su/",
          method: "GET",
          mode: "cors",
        },
      ).then((r) => r.json());

    return { tracks, pagination };
  }

  async download(
    trackId: number,
    name: string,
    roomId: string,
  ): Promise<string> {
    const { url: streamingUrl } = (await fetch(
      `https://dab.yeet.su/api/stream?trackId=${trackId}`,
      {
        credentials: "include",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.5",
          "Sec-GPC": "1",
          "Alt-Used": "dab.yeet.su",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          Priority: "u=4",
        },
        referrer: "https://dab.yeet.su/",
        method: "GET",
        mode: "cors",
      },
    ).then((r) => r.json())) as { url: string };

    // Create room-specific directory if it doesn't exist
    const roomDir = path.join(AUDIO_DIR, `room-${roomId}`);
    await mkdir(roomDir, { recursive: true });

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(name) || ".mp3"; // Preserve original extension or default to mp3
    const filename = `${timestamp}${ext}`;

    const fileId = path.join(`room-${roomId}`, filename);
    // Full path where the file will be saved
    const filePath = path.join(AUDIO_DIR, fileId);

    const audioResponse = await fetch(streamingUrl, {
      credentials: "omit",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
        Accept: "*/*", // Accept any content type (like audio/flac)
        "Accept-Language": "en-US,en;q=0.5",
        "Sec-GPC": "1",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site", // Correct for fetching from the streaming URL
        Priority: "u=0",
      },
    });

    if (!audioResponse.ok) {
      throw new Error(
        `Failed to download audio file: ${audioResponse.status} ${audioResponse.statusText}`,
      );
    }

    const buffer = await audioResponse.arrayBuffer();
    // Appearently, we have to fetch the buffer and then save, because seems that using the response directly blocks the thread
    await Bun.write(filePath, buffer);

    return fileId;
  }
}

const implementation = new DabMusicService();

export const SEARCH_SERVICE: SearchService = implementation;
export const DOWNLOAD_SERVICE: DownloadService = implementation;
