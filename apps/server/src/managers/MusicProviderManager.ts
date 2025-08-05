import {
  SearchParamsSchema,
  SearchResponseSchema,
  StreamResponseSchema,
  TrackParamsSchema,
} from "@beatsync/shared/";

export class MusicProviderManager {
  private providerUrl: string;

  constructor() {
    const url = process.env.PROVIDER_URL;
    if (!url) {
      throw new Error("PROVIDER_URL environment variable is required");
    }
    this.providerUrl = url;
  }

  async search(query: string, offset: number = 0) {
    try {
      const { q, offset: validOffset } = SearchParamsSchema.parse({
        q: query,
        offset,
      });

      const searchUrl = new URL("/api/search", this.providerUrl);
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("offset", validOffset.toString());

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return SearchResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Search failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async stream(trackId: number) {
    try {
      const { id } = TrackParamsSchema.parse({ id: trackId });

      const streamUrl = new URL("/api/track", this.providerUrl);
      streamUrl.searchParams.set("id", id.toString());

      const response = await fetch(streamUrl.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return StreamResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Download failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

// Export singleton instance
export const MUSIC_PROVIDER_MANAGER = new MusicProviderManager();
