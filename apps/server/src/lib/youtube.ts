import { $ } from "bun";
import { mkdtemp, readdir, rm } from "fs/promises";
import { nanoid } from "nanoid";
import { tmpdir } from "os";
import { join } from "path";
import { generateAudioFileName, uploadFile } from "./r2";

export interface YoutubeDownloadProgress {
  status: "downloading" | "uploading" | "completed" | "error";
  progress?: number;
  message?: string;
  error?: string;
  audioUrl?: string;
  title?: string;
  duration?: number;
}

export interface YoutubeDownloadResult {
  success: boolean;
  audioUrl?: string;
  title?: string;
  duration?: number;
  error?: string;
}

export interface YoutubeVideoInfo {
  title: string;
  duration: number;
  uploader: string;
  uploadDate: string;
  viewCount: number;
  formats: Array<{
    format_id: string;
    ext: string;
    acodec: string;
    filesize?: number;
    quality: string;
  }>;
}

/**
 * Extract YouTube video ID from URL
 */
export function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Validate that the URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return getYouTubeVideoId(url) !== null;
}

/**
 * Create a safe YouTube URL from video ID
 */
export function createSafeYouTubeUrl(videoId: string): string {
  // Only allow alphanumeric characters, hyphens, and underscores (YouTube video ID format)
  if (!/^[\w-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video ID format");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Get video information without downloading
 */
export async function getYouTubeVideoInfo(
  url: string
): Promise<YoutubeVideoInfo> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  const safeUrl = createSafeYouTubeUrl(videoId);

  try {
    const result =
      await $`yt-dlp --print-json --no-download --no-warnings ${safeUrl}`.text();

    const videoData = JSON.parse(result);
    return {
      title: videoData.title || "Unknown Title",
      duration: videoData.duration || 0,
      uploader: videoData.uploader || "Unknown",
      uploadDate: videoData.upload_date || "",
      viewCount: videoData.view_count || 0,
      formats:
        videoData.formats?.map((f: any) => ({
          format_id: f.format_id,
          ext: f.ext,
          acodec: f.acodec,
          filesize: f.filesize,
          quality: f.quality || f.format_note || "unknown",
        })) || [],
    };
  } catch (error) {
    console.error("Error getting video info:", error);
    throw new Error(
      `Failed to get video info: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Download YouTube audio and upload to R2
 */
export async function downloadYouTubeAudio(
  url: string,
  roomId: string,
  onProgress?: (progress: YoutubeDownloadProgress) => void
): Promise<YoutubeDownloadResult> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  const safeUrl = createSafeYouTubeUrl(videoId);
  let tempDir: string | undefined;

  try {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), "beatsync-youtube-"));

    // Get video info first
    onProgress?.({
      status: "downloading",
      progress: 0,
      message: "Getting video information...",
    });
    const videoInfo = await getYouTubeVideoInfo(url); // Use original URL for info

    onProgress?.({
      status: "downloading",
      progress: 10,
      message: `Starting download: ${videoInfo.title}`,
      title: videoInfo.title,
      duration: videoInfo.duration,
    });

    // Use a temporary filename pattern that yt-dlp will fill in
    const tempFilePattern = join(tempDir, "%(title)s.%(ext)s");

    // Download audio using yt-dlp with Bun's $ template - best quality available
    // Use the sanitized URL to prevent command injection
    console.log(`🔄 Starting yt-dlp download for: ${safeUrl}`);
    console.log(`📁 Temp directory: ${tempDir}`);
    console.log(`📝 Output pattern: ${tempFilePattern}`);

    try {
      await $`yt-dlp --extract-audio --audio-quality 0 --output ${tempFilePattern} --verbose ${safeUrl}`;
      console.log(`✅ yt-dlp download completed successfully`);
    } catch (error) {
      console.error(`❌ yt-dlp failed:`, error);
      // Try a simpler version test first
      try {
        const versionCheck = await $`yt-dlp --version`.text();
        console.log(`ℹ️ yt-dlp version: ${versionCheck}`);
      } catch (versionError) {
        console.error(`❌ yt-dlp version check failed:`, versionError);
      }
      throw error;
    }

    // Find the downloaded file (yt-dlp will have created it with the actual extension)
    const downloadedFiles = await readdir(tempDir);
    if (downloadedFiles.length === 0) {
      throw new Error("No file was downloaded");
    }

    const tempFile = join(tempDir, downloadedFiles[0]);
    const actualFileName = generateAudioFileName(downloadedFiles[0]);

    onProgress?.({
      status: "uploading",
      progress: 90,
      message: "Uploading to cloud storage...",
      title: videoInfo.title,
    });

    // Upload to R2 and get public URL
    const audioUrl = await uploadFile(tempFile, roomId, actualFileName);

    return {
      success: true,
      audioUrl,
      title: videoInfo.title,
      duration: videoInfo.duration,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    onProgress?.({
      status: "error",
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    // Cleanup temporary directory and all contents
    try {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn("Failed to cleanup temp directory:", error);
    }
  }
}

// Maximum number of concurrent downloads
const MAX_CONCURRENT_DOWNLOADS = 10;

/**
 * Download job management
 */
export class YouTubeDownloadManager {
  private activeDownloads = new Map<
    string,
    {
      url: string;
      roomId: string;
      progress: YoutubeDownloadProgress;
      startTime: number;
    }
  >();

  /**
   * Start a YouTube download job
   */
  async startDownload(
    url: string,
    roomId: string,
    onProgress?: (jobId: string, progress: YoutubeDownloadProgress) => void
  ): Promise<string> {
    // Check concurrency limit
    if (this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      throw new Error(
        `Maximum concurrent downloads reached (${MAX_CONCURRENT_DOWNLOADS}). Please try again later.`
      );
    }

    const jobId = nanoid();

    this.activeDownloads.set(jobId, {
      url,
      roomId,
      progress: { status: "downloading", progress: 0 },
      startTime: Date.now(),
    });

    // Start download asynchronously
    this.processDownload(jobId, url, roomId, onProgress).finally(() => {
      // Remove from active downloads immediately after completion
      this.activeDownloads.delete(jobId);
    });

    return jobId;
  }

  /**
   * Get download status
   */
  getDownloadStatus(jobId: string) {
    return this.activeDownloads.get(jobId);
  }

  /**
   * Get all active downloads
   */
  getActiveDownloads() {
    return Array.from(this.activeDownloads.entries()).map(([jobId, job]) => ({
      jobId,
      ...job,
    }));
  }

  /**
   * Cancel a download
   */
  cancelDownload(jobId: string): boolean {
    const job = this.activeDownloads.get(jobId);
    if (job) {
      this.activeDownloads.delete(jobId);
      return true;
    }
    return false;
  }

  private async processDownload(
    jobId: string,
    url: string,
    roomId: string,
    onProgress?: (jobId: string, progress: YoutubeDownloadProgress) => void
  ) {
    const updateProgress = (progress: YoutubeDownloadProgress) => {
      const job = this.activeDownloads.get(jobId);
      if (job) {
        job.progress = progress;
        onProgress?.(jobId, progress);
      }
    };

    try {
      const result = await downloadYouTubeAudio(url, roomId, updateProgress);

      if (result.success) {
        updateProgress({
          status: "completed",
          progress: 100,
          audioUrl: result.audioUrl,
          title: result.title,
          duration: result.duration,
        });
      } else {
        updateProgress({
          status: "error",
          error: result.error,
        });
      }
    } catch (error) {
      updateProgress({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

// Export singleton instance
export const youtubeDownloadManager = new YouTubeDownloadManager();
