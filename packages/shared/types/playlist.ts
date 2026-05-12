// Per-context playlist primitive. A "playback context" is anything a room can play
// audio inside of, identified by a string id. Audio rooms have a single context
// "main"; map rooms have one context per shape. The same primitive backs both — the
// only difference is how many contexts a room owns.

import { z } from "zod";
import { AudioSourceSchema } from "./basic";

/** The id used when no contextId is supplied (audio rooms, back-compat). */
export const MAIN_CONTEXT_ID = "main";

export const PlaylistPlaybackStateSchema = z.object({
  type: z.enum(["playing", "paused"]),
  /** URL of the audio source currently scheduled to play. "" when paused/idle. */
  audioSource: z.string(),
  /** Index into the playlist's tracks. 0 when paused/idle. */
  trackIndex: z.number().int().nonnegative().default(0),
  /** epoch ms — when the scheduled action was set to execute. */
  serverTimeToExecute: z.number(),
  /** Position in the current track at the time of the action. */
  trackPositionSeconds: z.number(),
});
export type PlaylistPlaybackStateType = z.infer<typeof PlaylistPlaybackStateSchema>;

export const INITIAL_PLAYLIST_PLAYBACK_STATE: PlaylistPlaybackStateType = {
  type: "paused",
  audioSource: "",
  trackIndex: 0,
  serverTimeToExecute: 0,
  trackPositionSeconds: 0,
};

/**
 * Server-authoritative playlist state broadcast to clients. Audio rooms have one
 * playlist with id="main"; future map rooms have one per shape. The `loop` flag
 * determines what happens when a track ends — true = loop the current track until
 * the user advances, false = play once then stop (audio-room default).
 */
export const PlaylistSchema = z.object({
  id: z.string(),
  tracks: z.array(AudioSourceSchema),
  loop: z.boolean().default(false),
  playbackState: PlaylistPlaybackStateSchema,
});
export type PlaylistType = z.infer<typeof PlaylistSchema>;
