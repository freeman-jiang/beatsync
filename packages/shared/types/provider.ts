import { z } from "zod";

export const SearchParamsSchema = z.object({
  q: z.string().min(1, "Query is required"),
  offset: z
    .number()
    .max(1000, "Offset must be less than 1000")
    .min(0, "Offset must be 0 or greater")
    .default(0),
});

export const TrackParamsSchema = z.object({
  id: z.number().min(0, "ID must be 0 or greater"),
});

export const AlbumSchema = z.object({
  image: z.object({
    small: z.string(),
    thumbnail: z.string(),
    large: z.string(),
    back: z.string().nullable().optional(),
  }),
  artists: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        roles: z.array(z.string()),
      })
    )
    .optional(),
  released_at: z.number().optional(),
  title: z.string(),
  duration: z.number(),
  parental_warning: z.boolean(),
  genre: z
    .object({
      path: z.array(z.number()),
      color: z.string(),
      name: z.string(),
      id: z.number(),
    })
    .optional(),
  id: z.string(),
  release_date_original: z.string(),
});

export const TrackSchema = z.object({
  isrc: z.string().nullable().optional(),
  copyright: z.string().nullable().optional(),
  performer: z.object({
    name: z.string(),
    id: z.number(),
  }),
  composer: z
    .object({
      name: z.string(),
      id: z.number(),
    })
    .optional(),
  album: AlbumSchema,
  track_number: z.number(),
  released_at: z.number().optional(),
  title: z.string(),
  version: z.string().nullable().optional(),
  duration: z.number(),
  parental_warning: z.boolean(),
  id: z.number(),
});

export const SearchResponseSchema = z.object({
  data: z.object({
    tracks: z.object({
      limit: z.number(),
      offset: z.number(),
      total: z.number(),
      items: z.array(TrackSchema),
    }),
  }),
});
export type SearchResponseType = z.infer<typeof SearchResponseSchema>;

export const StreamResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    url: z.string(),
  }),
});
