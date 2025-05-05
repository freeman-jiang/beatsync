import type { Track } from "@beatsync/shared";
import { Pagination } from "@beatsync/shared/types/schemas/dab";

/**
 * Implementations of this interface should provide search functionality from a provider.
 */
export interface SearchService {
  /**
   * Search a list of tracks from the provider.
   * @param query Search query
   */
  search(query: string, offset: number): Promise<SearchResult>;
}

/**
 * Implementations of this interface shold provide download functionality from a provider
 */
export interface DownloadService {
  /**
   * Downloads a track from the provider, returning the path of the downloaded file.
   * @param trackId The ID of the track to be downloaded
   * @returns the file ID of the downloaded track
   */
  download(trackId: number, name: string, roomId: string): Promise<string>;
}

export type SearchResult = {
  tracks: Track[];
  pagination?: Pagination;
};
