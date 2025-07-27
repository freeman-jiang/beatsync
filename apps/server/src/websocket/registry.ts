import { ClientActionEnum } from "@beatsync/shared";
import { handleAddYouTubeSource } from "./handlers/addYouTubeSource";
import { handleSetAdmin } from "./handlers/handleSetAdmin";
import { handleSetPlaybackControls } from "./handlers/handleSetPlaybackControls";
import { handleMoveClient } from "./handlers/moveClient";
import { handleNTPRequest } from "./handlers/ntpRequest";
import { handlePause } from "./handlers/pause";
import { handlePauseYouTube } from "./handlers/pauseYouTube";
import { handlePlay } from "./handlers/play";
import { handlePlayYouTube } from "./handlers/playYouTube";
import { handleRemoveYouTubeSource } from "./handlers/removeYouTubeSource";
import { handleReorderClient } from "./handlers/reorderClient";
import { handleSeekYouTube } from "./handlers/seekYouTube";
import { handleSetListeningSource } from "./handlers/setListeningSource";
import { handleSetMode } from "./handlers/setMode";
import { handleSetSelectedAudio } from "./handlers/setSelectedAudio";
import { handleSetSelectedYouTube } from "./handlers/setSelectedYouTube";
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

  [ClientActionEnum.enum.PLAY_YOUTUBE]: {
    handle: handlePlayYouTube,
    description: "Schedule YouTube play action for synchronized playback",
  },

  [ClientActionEnum.enum.PAUSE_YOUTUBE]: {
    handle: handlePauseYouTube,
    description: "Schedule YouTube pause action for synchronized playback",
  },

  [ClientActionEnum.enum.SEEK_YOUTUBE]: {
    handle: handleSeekYouTube,
    description: "Schedule YouTube seek action for synchronized playback",
  },

  [ClientActionEnum.enum.SET_MODE]: {
    handle: handleSetMode,
    description: "Set the current mode (library or youtube)",
  },

  [ClientActionEnum.enum.ADD_YOUTUBE_SOURCE]: {
    handle: handleAddYouTubeSource,
    description: "Add a YouTube source to the room",
  },

  [ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE]: {
    handle: handleRemoveYouTubeSource,
    description: "Remove a YouTube source from the room",
  },

  [ClientActionEnum.enum.SET_SELECTED_AUDIO]: {
    handle: handleSetSelectedAudio,
    description: "Set the selected audio source",
  },

  [ClientActionEnum.enum.SET_SELECTED_YOUTUBE]: {
    handle: handleSetSelectedYouTube,
    description: "Set the selected YouTube source",
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
