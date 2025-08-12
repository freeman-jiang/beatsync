import {
  RawSearchResponseSchema,
  SearchParamsSchema,
  StreamResponseSchema,
  TrackParamsSchema,
} from "@beatsync/shared/";
import { z } from "zod";

export class MusicProviderManager {
  private providerUrl: string | undefined;

  constructor() {
    // Lazy initialization - don't throw in constructor for test compatibility
    this.providerUrl = process.env.PROVIDER_URL;
  }

  private getProviderUrl(): string {
    if (!this.providerUrl) {
      throw new Error("PROVIDER_URL environment variable is required");
    }
    return this.providerUrl;
  }

  async search(
    query: string,
    offset: number = 0
  ): Promise<z.infer<typeof RawSearchResponseSchema>> {
    try {
      const { q, offset: validOffset } = SearchParamsSchema.parse({
        q: query,
        offset,
      });

      const searchUrl = new URL("/api/search", this.getProviderUrl());
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("offset", validOffset.toString());

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return RawSearchResponseSchema.parse(data);
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

      const streamUrl = new URL("/api/track", this.getProviderUrl());
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
