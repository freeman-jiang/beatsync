import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { getProbeStats, handleNTPResponse } from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, ServerActionEnum, type ExtractWSResponseFrom } from "@beatsync/shared";
import type { WebsocketResponseRegistry } from "@/websocket/types";

type RoomEvent = ExtractWSResponseFrom["ROOM_EVENT"]["event"];
type ScheduledAction = ExtractWSResponseFrom["SCHEDULED_ACTION"]["scheduledAction"];

const ROOM_EVENT_REGISTRY: {
  [K in RoomEvent["type"]]: (event: Extract<RoomEvent, { type: K }>) => void;
} = {
  CLIENT_CHANGE: (event) => {
    useGlobalStore.getState().setConnectedClients(event.clients);
  },
  SET_AUDIO_SOURCES: (event) => {
    useGlobalStore.getState().handleSetAudioSources(event);
  },
  SET_PLAYBACK_CONTROLS: (event) => {
    useGlobalStore.getState().setPlaybackControlsPermissions(event.permissions);
  },
  CHAT_UPDATE: (event) => {
    useChatStore.getState().setMessages(event.messages, event.isFullSync, event.newestId);
  },
  LOAD_AUDIO_SOURCE: (event) => {
    useGlobalStore.getState().handleLoadAudioSource(event);
  },
};

const SCHEDULED_ACTION_REGISTRY: {
  [K in ScheduledAction["type"]]: (data: {
    action: Extract<ScheduledAction, { type: K }>;
    serverTimeToExecute: number;
  }) => void;
} = {
  PLAY: ({ action, serverTimeToExecute }) => {
    useGlobalStore.getState().schedulePlay({
      trackTimeSeconds: action.trackTimeSeconds,
      targetServerTime: serverTimeToExecute,
      audioSource: action.audioSource,
    });
  },
  PAUSE: ({ serverTimeToExecute }) => {
    useGlobalStore.getState().schedulePause({ targetServerTime: serverTimeToExecute });
  },
  SPATIAL_CONFIG: ({ action }) => {
    const { processSpatialConfig, isSpatialAudioEnabled, setIsSpatialAudioEnabled } = useGlobalStore.getState();
    processSpatialConfig(action);
    if (!isSpatialAudioEnabled) {
      setIsSpatialAudioEnabled(true);
    }
  },
  STOP_SPATIAL_AUDIO: () => {
    useGlobalStore.getState().processStopSpatialAudio();
  },
  GLOBAL_VOLUME_CONFIG: ({ action }) => {
    useGlobalStore.getState().processGlobalVolumeConfig(action);
  },
  LOW_PASS_CONFIG: ({ action }) => {
    useGlobalStore.getState().processLowPassConfig(action);
  },
  METRONOME_CONFIG: ({ action }) => {
    useGlobalStore.getState().processMetronomeConfig(action);
  },
};

export const WS_RESPONSE_REGISTRY: WebsocketResponseRegistry = {
  [ServerActionEnum.enum.LIVENESS_PING]: {
    handle: ({ context }) => {
      // Server liveness probe — sent only after ~15s of silence, i.e. when this
      // tab is backgrounded and its timers are throttled (no NTP heartbeat).
      // Reply immediately so the server doesn't reap us, and piggyback a probe
      // pair to keep the clock offset fresh while parked.
      sendWSRequest({ ws: context.ws, request: { type: ClientActionEnum.enum.LIVENESS_PONG } });
      useGlobalStore.getState().sendProbePair();
    },
    description: "Liveness probe; reply with LIVENESS_PONG so the server knows this tab is alive",
  },

  [ServerActionEnum.enum.NTP_RESPONSE]: {
    handle: ({ response, context }) => {
      const pairResult = handleNTPResponse(response);
      if (pairResult) {
        useGlobalStore.getState().addProbePairResult(pairResult);
      }
      // Always refresh probe stats so UI shows sent/pure/impure counts in real time
      useGlobalStore.setState({ probeStats: getProbeStats() });

      // Mark that we received an NTP response (for staleness detection)
      context.markNTPResponseReceived();
    },
    description: "Time synchronization probe reply for NTP-based sync",
  },

  [ServerActionEnum.enum.ROOM_EVENT]: {
    handle: ({ response }) => {
      const { event } = response;
      console.log("Room event:", event);

      const handler = ROOM_EVENT_REGISTRY[event.type];
      // Same limitation as the top-level dispatcher: TypeScript cannot correlate
      // a dynamic property access with the discriminated union member it maps to.
      // @ts-expect-error - event matches the handler keyed by its own type
      handler(event);
    },
    description: "Room state changes (clients, audio sources, chat, playback controls)",
  },

  [ServerActionEnum.enum.SCHEDULED_ACTION]: {
    handle: ({ response }) => {
      console.log("Received scheduled action:", response);
      const { scheduledAction, serverTimeToExecute } = response;

      const handler = SCHEDULED_ACTION_REGISTRY[scheduledAction.type];
      // @ts-expect-error - action matches the handler keyed by its own type
      handler({ action: scheduledAction, serverTimeToExecute });
    },
    description: "Time-synchronized actions (play, pause, spatial config, volume, ...)",
  },

  [ServerActionEnum.enum.SEARCH_RESPONSE]: {
    handle: ({ response }) => {
      console.log("Received search response:", response);
      const { setSearchResults, setIsSearching, setIsLoadingMoreResults, setHasMoreResults, isLoadingMoreResults } =
        useGlobalStore.getState();

      // Determine if this is pagination or new search
      const isAppending = isLoadingMoreResults;

      // Update search results (append if pagination, replace if new search)
      setSearchResults(response.response, isAppending);

      // Update loading states
      setIsSearching(false);
      setIsLoadingMoreResults(false);

      // Update hasMoreResults based on response
      if (response.response.type === "success") {
        const { total, items, offset } = response.response.response.data.tracks;
        const hasMore = offset + items.length < total;
        setHasMoreResults(hasMore);
      } else {
        setHasMoreResults(false);
      }
    },
    description: "Music search results",
  },

  [ServerActionEnum.enum.STREAM_JOB_UPDATE]: {
    handle: ({ response }) => {
      console.log("Received stream job update:", response.activeJobCount);
      useGlobalStore.getState().setActiveStreamJobs(response.activeJobCount);
    },
    description: "Active stream job count changed",
  },

  [ServerActionEnum.enum.DEMO_USER_COUNT]: {
    handle: ({ response }) => {
      if (useGlobalStore.getState().demoUserCount !== response.count) {
        useGlobalStore.setState({ demoUserCount: response.count });
      }
    },
    description: "Demo mode: connected user count",
  },

  [ServerActionEnum.enum.DEMO_AUDIO_READY_COUNT]: {
    handle: ({ response }) => {
      if (useGlobalStore.getState().demoAudioReadyCount !== response.count) {
        useGlobalStore.setState({ demoAudioReadyCount: response.count });
      }
    },
    description: "Demo mode: clients with audio loaded",
  },
};
