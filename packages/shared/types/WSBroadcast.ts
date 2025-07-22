import { z } from "zod";
import {
  PauseActionSchema,
  PlayActionSchema,
  PlaybackControlsPermissionsEnum,
} from "./WSRequest";
import { AudioSourceSchema, PositionSchema } from "./basic";

// Client schema for room state
const ClientSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  ws: z.any(), // Just gets serialized as {}
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  position: PositionSchema,
  lastNtpResponse: z.number().default(0), // Last NTP response timestamp
  isAdmin: z.boolean().default(false), // Admin status
});
export type ClientType = z.infer<typeof ClientSchema>;

// SCHEDULED ACTIONS
const SpatialConfigSchema = z.object({
  type: z.literal("SPATIAL_CONFIG"),
  gains: z.record(
    z.string(),
    z.object({ gain: z.number().min(0).max(1), rampTime: z.number() })
  ),
  listeningSource: PositionSchema,
});

export type SpatialConfigType = z.infer<typeof SpatialConfigSchema>;

const StopSpatialAudioSchema = z.object({
  type: z.literal("STOP_SPATIAL_AUDIO"),
});
export type StopSpatialAudioType = z.infer<typeof StopSpatialAudioSchema>;

// Separate from the room state update because it's not part of the room state
export const ScheduledActionSchema = z.object({
  type: z.literal("SCHEDULED_ACTION"),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
  ]),
});

const SerializedRoomStateSchema = z.object({
  roomId: z.string(),
  clients: z.array(ClientSchema),
  audioSources: z.array(AudioSourceSchema),
  playbackControlsPermissions: PlaybackControlsPermissionsEnum,
});
export type SerializedRoomStateType = z.infer<typeof SerializedRoomStateSchema>;

// Complete room state update
const RoomStateUpdateSchema = z.object({
  type: z.literal("ROOM_STATE_UPDATE"),
  state: SerializedRoomStateSchema,
});
export type RoomStateUpdateType = z.infer<typeof RoomStateUpdateSchema>;

// Export broadcast types - only scheduled actions and room state updates
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomStateUpdateSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
