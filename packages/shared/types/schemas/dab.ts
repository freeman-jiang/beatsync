import type { Track } from "../basic";

/**
 * Defines a track type.
 */
export interface DABTrack extends Track {
    id: number;
    title: string;
    artist: string;
    albumTitle: string;
    duration: number;
    version: string | null;
    images: {
        small: string;
        thumbnail: string;
        large: string;
    };
};

export type Pagination = {
    offset: number;
    total: number;
    hasMore: boolean;
};