import { ClientActionEnum } from "@beatsync/shared";
import { handleSetAdmin } from "./handlers/handleSetAdmin";
import { handleSetPlaybackControls } from "./handlers/handleSetPlaybackControls";
import { handleMoveClient } from "./handlers/moveClient";
import { handleNTPRequest } from "./handlers/ntpRequest";
import { handlePause } from "./handlers/pause";
import { handlePlay } from "./handlers/play";
import { handleReorderClient } from "./handlers/reorderClient";
import { handleSetListeningSource } from "./handlers/setListeningSource";
import { handleStartSpatialAudio } from "./handlers/startSpatialAudio";
import { handleStopSpatialAudio } from "./handlers/stopSpatialAudio";
import { handleSync } from "./handlers/sync";
import { WebsocketRegistry } from "./types";

export const WS_REGISTRY: WebsocketRegistry = {
  [ClientActionEnum.enum.NTP_REQUEST]: {
    handle: handleNTPRequest,
    description: "Time synchronization request for NTP-based sync",
  },
  [ClientActionEnum.enum.PLAY]: {
    handle: handlePlay,
    description: "Schedule play action for synchronized playback",
  },

  [ClientActionEnum.enum.PAUSE]: {
    handle: handlePause,
    description: "Schedule pause action for synchronized playback",
  },

  [ClientActionEnum.enum.START_SPATIAL_AUDIO]: {
    handle: handleStartSpatialAudio,
    description: "Start spatial audio processing loop",
  },

  [ClientActionEnum.enum.STOP_SPATIAL_AUDIO]: {
    handle: handleStopSpatialAudio,
    description: "Stop spatial audio processing and reset gains",
  },

  [ClientActionEnum.enum.REORDER_CLIENT]: {
    handle: handleReorderClient,
    description: "Reorder clients in room for spatial positioning",
  },

  [ClientActionEnum.enum.SET_LISTENING_SOURCE]: {
    handle: handleSetListeningSource,
    description: "Update listening position for spatial audio",
  },

  [ClientActionEnum.enum.MOVE_CLIENT]: {
    handle: handleMoveClient,
    description: "Move client position in spatial audio space",
  },

  [ClientActionEnum.enum.SYNC]: {
    handle: handleSync,
    description: "Sync late-joining client with room state",
  },

  [ClientActionEnum.enum.SET_ADMIN]: {
    handle: handleSetAdmin,
    description: "Set admin status for a client",
  },

  [ClientActionEnum.enum.SET_PLAYBACK_CONTROLS]: {
    handle: handleSetPlaybackControls,
    description: "Set playback controls for a room",
  },
};
