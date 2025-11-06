import { ClientActionEnum } from "@beatsync/shared";
import { handleAudioSourceLoaded } from "./handlers/handleAudioSourceLoaded";
import { handleDeleteAudioSources } from "./handlers/handleDeleteAudioSources";
import { handleLoadDefaultTracks } from "./handlers/handleLoadDefaultTracks";
import { handleSearchMusic } from "./handlers/handleSearchMusic";
import { handleSendChatMessage } from "./handlers/handleSendChatMessage";
import { handleSendIp } from "./handlers/handleSendIp";
import { handleSetAdmin } from "./handlers/handleSetAdmin";
import { handleSetPlaybackControls } from "./handlers/handleSetPlaybackControls";
import { handleStreamMusic } from "./handlers/handleStreamMusic";
import { handleMoveClient } from "./handlers/moveClient";
import { handleNTPRequest } from "./handlers/ntpRequest";
import { handlePause } from "./handlers/pause";
import { handlePlay } from "./handlers/play";
import { handleReorderClient } from "./handlers/reorderClient";
import { handleSetGlobalVolume } from "./handlers/setGlobalVolume";
import { handleSetListeningSource } from "./handlers/setListeningSource";
import { handleStartSpatialAudio } from "./handlers/startSpatialAudio";
import { handleStopSpatialAudio } from "./handlers/stopSpatialAudio";
import { handleReorderAudioSources } from "./handlers/handleReorderAudioSources";
import { handleSync } from "./handlers/sync";
import { WebsocketRegistry } from "./types";

export const WS_REGISTRY: WebsocketRegistry = {
  [ClientActionEnum.enum.AUDIO_SOURCE_LOADED]: {
    handle: handleAudioSourceLoaded,
    description: "Audio source loaded event",
  },
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

  [ClientActionEnum.enum.LOAD_DEFAULT_TRACKS]: {
    handle: handleLoadDefaultTracks,
    description: "Load default tracks into the room if queue is empty",
  },

  [ClientActionEnum.enum.DELETE_AUDIO_SOURCES]: {
    handle: handleDeleteAudioSources,
    description: "Delete audio sources with room prefix (non-default only)",
  },

  [ClientActionEnum.enum.SET_ADMIN]: {
    handle: handleSetAdmin,
    description: "Set admin status for a client",
  },

  [ClientActionEnum.enum.SET_PLAYBACK_CONTROLS]: {
    handle: handleSetPlaybackControls,
    description: "Set playback controls for a room",
  },

  [ClientActionEnum.enum.SEND_IP]: {
    handle: handleSendIp,
    description: "Send IP to server",
  },

  [ClientActionEnum.enum.SEARCH_MUSIC]: {
    handle: handleSearchMusic,
    description: "Search for music",
  },

  [ClientActionEnum.enum.STREAM_MUSIC]: {
    handle: handleStreamMusic,
    description: "Stream music",
  },

  [ClientActionEnum.enum.SET_GLOBAL_VOLUME]: {
    handle: handleSetGlobalVolume,
    description: "Set global volume for all clients in the room",
  },

  [ClientActionEnum.enum.SEND_CHAT_MESSAGE]: {
    handle: handleSendChatMessage,
    description: "Send a chat message to all clients in the room",
  },
  [ClientActionEnum.enum.REORDER_AUDIO_SOURCES]: {
    handle: handleReorderAudioSources,
    description: "Reorder audio sources in the room queue",
  },
};
