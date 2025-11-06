/* eslint-disable @typescript-eslint/no-unused-vars */
import { audioContextManager } from "@/lib/audioContextManager";
import { getClientId } from "@/lib/clientId";
import { extractFileNameFromUrl } from "@/lib/utils";
import {
  _sendNTPRequest,
  calculateOffsetEstimate,
  calculateWaitTimeMilliseconds,
  NTPMeasurement,
} from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  AudioSourceSchema,
  AudioSourceType,
  ClientActionEnum,
  ClientDataType,
  GlobalVolumeConfigType,
  GRID,
  LoadAudioSourceType,
  NTP_CONSTANTS,
  PlaybackControlsPermissionsEnum,
  PlaybackControlsPermissionsType,
  PositionType,
  SearchResponseType,
  SetAudioSourcesType,
  SpatialConfigType,
} from "@beatsync/shared";
import { Mutex } from "async-mutex";
import { toast } from "sonner";
import { create } from "zustand";

export const MAX_NTP_MEASUREMENTS = NTP_CONSTANTS.MAX_MEASUREMENTS;

// LRU Cache configuration for audio buffers
const MAX_CACHED_BUFFERS = 3;

// https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch02.html

interface AudioPlayerState {
  audioContext: AudioContext;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

enum AudioPlayerError {
  NotInitialized = "NOT_INITIALIZED",
}

import { z } from "zod";

// Discriminated union for AudioSourceState using zod
export const AudioSourceStateSchema = z.discriminatedUnion("status", [
  z.object({
    source: AudioSourceSchema,
    status: z.literal("idle"),
  }),
  z.object({
    source: AudioSourceSchema,
    status: z.literal("loading"),
  }),
  z.object({
    source: AudioSourceSchema,
    status: z.literal("loaded"),
    buffer: z.custom<AudioBuffer>(),
  }),
  z.object({
    source: AudioSourceSchema,
    status: z.literal("error"),
    error: z.string(),
  }),
]);
export type AudioSourceState = z.infer<typeof AudioSourceStateSchema>;

// Interface for just the state values (without methods)
interface GlobalStateValues {
  // Audio Sources
  audioSources: AudioSourceState[]; // Playlist with loading states
  bufferAccessQueue: string[]; // Track URL access order for LRU eviction
  isInitingSystem: boolean;
  hasUserStartedSystem: boolean; // Track if user has clicked "Start System" at least once
  selectedAudioUrl: string;

  // Websocket
  socket: WebSocket | null;
  lastMessageReceivedTime: number | null;

  // Spatial audio
  spatialConfig?: SpatialConfigType;
  listeningSourcePosition: PositionType;
  isDraggingListeningSource: boolean;
  isSpatialAudioEnabled: boolean;

  // Connected clients
  connectedClients: ClientDataType[];
  currentUser: ClientDataType | null;

  // NTP
  ntpMeasurements: NTPMeasurement[];
  offsetEstimate: number;
  roundTripEstimate: number;
  isSynced: boolean;

  // Audio Player
  audioPlayer: AudioPlayerState | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  globalVolume: number; // Master volume (0-1)

  // Tracking properties
  playbackStartTime: number;
  playbackOffset: number;

  // Shuffle state
  isShuffled: boolean;
  reconnectionInfo: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  };

  // Playback controls
  playbackControlsPermissions: PlaybackControlsPermissionsType;

  // Search results
  searchResults: SearchResponseType | null;
  isSearching: boolean;
  isLoadingMoreResults: boolean;
  searchQuery: string;
  searchOffset: number;
  hasMoreResults: boolean;

  // Stream job tracking
  activeStreamJobs: number;
}

interface GlobalState extends GlobalStateValues {
  // Methods
  getAudioDuration: ({ url }: { url: string }) => number;
  getSelectedTrack: () => AudioSourceState | null;
  handleSetAudioSources: (data: SetAudioSourcesType) => void;

  setIsInitingSystem: (isIniting: boolean) => void;
  reorderClient: (clientId: string) => void;
  setAdminStatus: (clientId: string, isAdmin: boolean) => void;
  changeAudioSource: (url: string) => boolean;
  findAudioIndexByUrl: (url: string) => number | null;
  schedulePlay: (data: {
    trackTimeSeconds: number;
    targetServerTime: number;
    audioSource: string;
  }) => void;
  schedulePause: (data: { targetServerTime: number }) => void;
  setSocket: (socket: WebSocket) => void;
  broadcastPlay: (trackTimeSeconds?: number) => void;
  broadcastPause: () => void;
  startSpatialAudio: () => void;
  sendStopSpatialAudio: () => void;
  sendChatMessage: (text: string) => void;
  setSpatialConfig: (config: SpatialConfigType) => void;
  updateListeningSource: (position: PositionType) => void;
  setListeningSourcePosition: (position: PositionType) => void;
  setIsDraggingListeningSource: (isDragging: boolean) => void;
  setIsSpatialAudioEnabled: (isEnabled: boolean) => void;
  processStopSpatialAudio: () => void;
  setConnectedClients: (clients: ClientDataType[]) => void;
  sendNTPRequest: () => void;
  resetNTPConfig: () => void;
  addNTPMeasurement: (measurement: NTPMeasurement) => void;
  onConnectionReset: () => void;
  playAudio: (data: {
    offset: number;
    when: number;
    audioIndex?: number;
  }) => void;
  processSpatialConfig: (config: SpatialConfigType) => void;
  pauseAudio: (data: { when: number }) => void;
  getCurrentTrackPosition: () => number;
  toggleShuffle: () => void;
  skipToNextTrack: (isAutoplay?: boolean) => void;
  skipToPreviousTrack: () => void;
  getCurrentGainValue: () => number;
  getCurrentSpatialGainValue: () => number;
  setGlobalVolume: (volume: number) => void;
  sendGlobalVolumeUpdate: (volume: number) => void;
  processGlobalVolumeConfig: (config: GlobalVolumeConfigType) => void;
  applyFinalGain: (rampTime?: number) => void;
  resetStore: () => void;
  setReconnectionInfo: (info: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  }) => void;
  setPlaybackControlsPermissions: (
    permissions: PlaybackControlsPermissionsType
  ) => void;

  // Search methods
  setSearchResults: (
    results: SearchResponseType | null,
    append?: boolean
  ) => void;
  setIsSearching: (isSearching: boolean) => void;
  setIsLoadingMoreResults: (isLoading: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchOffset: (offset: number) => void;
  setHasMoreResults: (hasMore: boolean) => void;
  clearSearchResults: () => void;
  loadMoreSearchResults: () => void;

  // Stream job methods
  setActiveStreamJobs: (count: number) => void;

  // Audio source methods
  handleLoadAudioSource: (sources: LoadAudioSourceType) => void;
  broadcastReorder: (urls: AudioSourceType[]) => void;
}

// Define initial state values
const initialState: GlobalStateValues = {
  // Audio Sources
  audioSources: [],
  bufferAccessQueue: [],

  // Audio playback state
  isPlaying: false,
  currentTime: 0,
  playbackStartTime: 0,
  playbackOffset: 0,
  selectedAudioUrl: "",

  // Spatial audio
  isShuffled: false,
  isSpatialAudioEnabled: false,
  isDraggingListeningSource: false,
  listeningSourcePosition: { x: GRID.SIZE / 2, y: GRID.SIZE / 2 },
  spatialConfig: undefined,

  // Network state
  socket: null,
  lastMessageReceivedTime: null,
  connectedClients: [],
  currentUser: null,

  // NTP state
  ntpMeasurements: [],
  offsetEstimate: 0,
  roundTripEstimate: 0,
  isSynced: false,

  // Loading state
  isInitingSystem: true,
  hasUserStartedSystem: false,

  // These need to be initialized to prevent type errors
  audioPlayer: null,
  duration: 0,
  volume: 0.5,
  globalVolume: 1.0, // Default 100%
  reconnectionInfo: {
    isReconnecting: false,
    currentAttempt: 0,
    maxAttempts: 0,
  },

  // Playback controls
  playbackControlsPermissions: PlaybackControlsPermissionsEnum.enum.EVERYONE,

  // Search results
  searchResults: null,
  isSearching: false,
  isLoadingMoreResults: false,
  searchQuery: "",
  searchOffset: 0,
  hasMoreResults: false,

  // Stream job tracking
  activeStreamJobs: 0,
};

const getAudioPlayer = (state: GlobalState) => {
  if (!state.audioPlayer) {
    throw new Error(AudioPlayerError.NotInitialized);
  }
  return state.audioPlayer;
};

const getSocket = (state: GlobalState) => {
  if (!state.socket) {
    throw new Error("Socket not initialized");
  }
  return {
    socket: state.socket,
  };
};

const getWaitTimeSeconds = (state: GlobalState, targetServerTime: number) => {
  const { offsetEstimate } = state;

  const waitTimeMilliseconds = calculateWaitTimeMilliseconds(
    targetServerTime,
    offsetEstimate
  );
  return waitTimeMilliseconds / 1000;
};

const downloadBufferFromURL = async ({ url }: { url: string }) => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContextManager.decodeAudioData(arrayBuffer);
  return {
    audioBuffer,
  };
};

const initializationMutex = new Mutex();

// Selector for canMutate
export const useCanMutate = () => {
  const currentUser = useGlobalStore((state) => state.currentUser);
  const playbackControlsPermissions = useGlobalStore(
    (state) => state.playbackControlsPermissions
  );

  const isAdmin = currentUser?.isAdmin || false;
  const isEveryoneMode =
    playbackControlsPermissions ===
    PlaybackControlsPermissionsEnum.enum.EVERYONE;
  return isAdmin || isEveryoneMode;
};

export const useGlobalStore = create<GlobalState>((set, get) => {
  // Helper function to manage LRU cache
  const addURLToLRU = (url: string) => {
    const state = get();
    const queue = [...state.bufferAccessQueue];

    // Remove URL if it exists (to move it to front)
    const existingIndex = queue.indexOf(url);
    if (existingIndex > -1) {
      queue.splice(existingIndex, 1);
    }

    // Add URL to front
    queue.unshift(url);

    // Determine which URLs to evict (if any)
    const urlsToEvict: string[] = [];
    while (queue.length > MAX_CACHED_BUFFERS) {
      const urlToEvict = queue.pop();
      if (urlToEvict) {
        // Don't evict the currently selected/playing track
        if (urlToEvict !== state.selectedAudioUrl) {
          urlsToEvict.push(urlToEvict);
          console.log(`[LRU Cache] Evicting ${urlToEvict}`);
        } else {
          // If we tried to evict the playing track, keep it at the end
          queue.push(urlToEvict);
          break;
        }
      }
    }

    // Apply all changes in one atomic update
    set((currentState) => ({
      bufferAccessQueue: queue,
      audioSources: currentState.audioSources.map((as) =>
        urlsToEvict.includes(as.source.url)
          ? { ...as, status: "idle", buffer: undefined }
          : as
      ),
    }));
  };

  // Load audio buffer for a source
  const loadAudioSource = async (url: string) => {
    try {
      // Check if already loaded, if so just tell the server that you have it
      const state = get();
      const existing = state.audioSources.find((as) => as.source.url === url);
      if (existing && existing.status === "loaded") {
        // Update LRU queue when accessing an already loaded buffer
        addURLToLRU(url);

        const { socket } = getSocket(state);
        sendWSRequest({
          ws: socket,
          request: {
            type: ClientActionEnum.enum.AUDIO_SOURCE_LOADED,
            source: { url },
          },
        });
        return;
      }

      // Mark as loading
      set((currentState) => ({
        audioSources: currentState.audioSources.map((as) =>
          as.source.url === url ? { ...as, status: "loading" } : as
        ),
      }));

      const { audioBuffer } = await downloadBufferFromURL({ url });

      // Update the source with loaded buffer
      set((currentState) => ({
        audioSources: currentState.audioSources.map((as) =>
          as.source.url === url
            ? { ...as, status: "loaded", buffer: audioBuffer }
            : as
        ),
      }));

      // Update LRU queue after successfully loading a new buffer
      addURLToLRU(url);

      // Send message to server that the source is loaded
      const { socket } = getSocket(state);
      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.AUDIO_SOURCE_LOADED,
          source: { url },
        },
      });
    } catch (error) {
      console.error(`Failed to load audio source ${url}:`, error);
      // Update the source with error status
      set((currentState) => ({
        audioSources: currentState.audioSources.map((as) =>
          as.source.url === url
            ? { ...as, status: "error", error: String(error) }
            : as
        ),
      }));
    }
  };

  // Function to initialize or reinitialize audio system
  // If concurrent initialization is detected, only first one will continue
  const initializeAudioExclusively = async () => {
    if (initializationMutex.isLocked()) {
      console.log("Audio initialization already in progress, skipping");
      return;
    }

    await initializationMutex.runExclusive(async () => {
      await _initializeAudio();
    });
  };

  const _initializeAudio = async () => {
    console.log("initializeAudio()");

    // Get singleton audio context and gain node
    const audioContext = audioContextManager.getContext();
    const gainNode = audioContextManager.getMasterGain();

    // Set up state change callback for iOS suspensions
    audioContextManager.setStateChangeCallback((state) => {
      console.log(`AudioContext state changed to: ${state}`);

      if (state === "suspended") {
        const currentState = get();

        // Stop playback cleanly if playing
        if (currentState.isPlaying && currentState.audioPlayer) {
          try {
            currentState.audioPlayer.sourceNode.stop();
          } catch (e) {
            // Ignore errors if already stopped
          }
        }

        // Reuse the init system UI - user will need to click "Start System" again
        console.log("AudioContext suspended by iOS");
        set({
          isInitingSystem: true,
          hasUserStartedSystem: false, // Reset user start system state
        });
      }
    });

    // Set initial volume
    const state = get();
    audioContextManager.setMasterGain(state.globalVolume);

    // Create initial source node (will be replaced on play)
    const sourceNode = audioContextManager.createBufferSource();

    // Initialize audio player state
    set({
      audioPlayer: {
        audioContext,
        sourceNode,
        gainNode,
      },
    });

    // Do not preload default sources; queue starts empty.
  };

  if (typeof window !== "undefined") {
    // @ts-expect-error only exists for iOS
    if (window.navigator.audioSession) {
      // @ts-expect-error only exists for iOS
      window.navigator.audioSession.type = "playback";
    }

    console.log("Detected that no audio sources were loaded, initializing");
    initializeAudioExclusively();
  }

  return {
    // Initialize with initialState
    ...initialState,

    // Add all required methods
    reorderClient: (clientId) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.REORDER_CLIENT,
          clientId,
        },
      });
    },

    setAdminStatus: (clientId, isAdmin) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SET_ADMIN,
          clientId,
          isAdmin,
        },
      });
    },

    setSpatialConfig: (spatialConfig) => set({ spatialConfig }),

    updateListeningSource: ({ x, y }) => {
      const state = get();
      const { socket } = getSocket(state);

      // Update local state
      set({ listeningSourcePosition: { x, y } });

      sendWSRequest({
        ws: socket,
        request: { type: ClientActionEnum.enum.SET_LISTENING_SOURCE, x, y },
      });
    },

    setIsInitingSystem: async (isIniting) => {
      // When initialization is complete (isIniting = false), check if we need to resume audio
      if (!isIniting) {
        const state = get();
        // Mark that user has started the system
        set({ hasUserStartedSystem: true });

        try {
          await audioContextManager.resume();
          console.log("AudioContext resumed via user gesture");
        } catch (err) {
          console.warn("Failed to resume AudioContext", err);
        }

        const { socket } = getSocket(state);

        // Request sync with room if conditions are met
        sendWSRequest({
          ws: socket,
          request: { type: ClientActionEnum.enum.SYNC },
        });
      }

      // Update the initialization state
      set({ isInitingSystem: isIniting });
    },

    /**
     * Switches the current audio track to the given URL.
     * - Stops any current playback immediately.
     * - Resets playback state (currentTime, playbackStartTime, playbackOffset, isPlaying).
     * - Updates selectedAudioUrl and duration (if available).
     * - Returns whether playback was active before the change (for skip logic).
     */
    changeAudioSource: (url) => {
      const state = get();
      const wasPlaying = state.isPlaying; // Store if it was playing *before* stopping

      // Stop any current playback immediately when switching tracks
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch (e) {
          // Ignore errors if already stopped or not initialized
        }
      }

      // Find the new audio source for duration
      const audioIndex = state.findAudioIndexByUrl(url);
      let newDuration = 0;
      if (audioIndex !== null) {
        const audioSourceState = state.audioSources[audioIndex];
        if (audioSourceState.status === "loaded" && audioSourceState.buffer) {
          newDuration = audioSourceState.buffer.duration;
        }
        // If not loaded, duration will be 0 (will be updated when loaded)
      }

      // Reset timing state and update selected ID
      set({
        selectedAudioUrl: url,
        isPlaying: false, // Always stop playback on track change before potentially restarting
        currentTime: 0,
        playbackStartTime: 0,
        playbackOffset: 0,
        duration: newDuration,
      });

      // Return the previous playing state for the skip functions to use
      return wasPlaying;
    },

    findAudioIndexByUrl: (url: string) => {
      const state = get();
      // Look through the audioSources for a matching URL
      const index = state.audioSources.findIndex(
        (sourceState) => sourceState.source.url === url
      );
      return index >= 0 ? index : null; // Return null if not found
    },

    schedulePlay: async (data) => {
      const state = get();
      if (state.isInitingSystem) {
        console.log("Not playing audio, still loading");
        // Non-interactive state, can't play audio
        return;
      }

      // Simulate scheduling delay for testing: sleep for 2s
      // if (Math.random() < 0.5) {
      //   await new Promise((resolve) => setTimeout(resolve, 1000));
      // }

      const waitTimeSeconds = getWaitTimeSeconds(state, data.targetServerTime);

      // Check if the scheduled time has already passed (with 50ms tolerance)
      if (waitTimeSeconds < 0.05) {
        console.warn(
          `Scheduled playback time has passed or is too close. Requesting resync...`
        );

        // Don't play - request a fresh sync instead
        const { socket } = getSocket(state);
        sendWSRequest({
          ws: socket,
          request: { type: ClientActionEnum.enum.SYNC },
        });

        // Show user feedback
        toast.info("Experiencing some network delays...", {
          id: "lateSchedule",
          duration: 2000,
        });

        return; // Exit without playing
      }

      console.log(
        `Playing track ${data.audioSource} at ${data.trackTimeSeconds} seconds in ${waitTimeSeconds}`
      );

      // Update the selected audio ID
      if (data.audioSource !== state.selectedAudioUrl) {
        set({ selectedAudioUrl: data.audioSource });
      }

      // Find the index of the audio to play
      const audioIndex = state.findAudioIndexByUrl(data.audioSource);

      // Check if track doesn't exist at all
      if (audioIndex === null) {
        // Track doesn't exist - it was deleted or never existed
        // Just log and stop - don't retry, don't show toast
        if (state.isPlaying) {
          state.pauseAudio({ when: 0 });
        }

        console.warn(
          `Cannot play audio: Track not found in audioSources: ${data.audioSource}`
        );

        // NO retry, NO toast - track is gone permanently
        return;
      }

      // Check if track exists but is still loading
      if (state.audioSources[audioIndex]?.status === "loading") {
        // Track exists but audio buffer isn't ready yet
        if (state.isPlaying) {
          state.pauseAudio({ when: 0 });
        }

        console.warn(
          `Cannot play audio: Track still loading: ${data.audioSource}`
        );

        // Show toast for legitimate loading state
        toast.warning(
          `"${extractFileNameFromUrl(data.audioSource)}" not loaded yet...`,
          { id: "schedulePlay" }
        );

        // Retry sync after 1 second - track should load eventually
        const { socket } = getSocket(state);
        setTimeout(() => {
          sendWSRequest({
            ws: socket,
            request: { type: ClientActionEnum.enum.SYNC },
          });
        }, 1000);

        return;
      }

      state.playAudio({
        offset: data.trackTimeSeconds,
        when: waitTimeSeconds,
        audioIndex, // Pass the found index for actual playback
      });
    },

    schedulePause: ({ targetServerTime }: { targetServerTime: number }) => {
      const state = get();
      const waitTimeSeconds = getWaitTimeSeconds(state, targetServerTime);
      console.log(`Pausing track in ${waitTimeSeconds}`);

      state.pauseAudio({
        when: waitTimeSeconds,
      });
    },

    setSocket: (socket) => set({ socket }),

    // if trackTimeSeconds is not provided, use the current track position
    broadcastPlay: (trackTimeSeconds?: number) => {
      const state = get();
      const { socket } = getSocket(state);

      // Use selected audio or fall back to first audio source
      let audioId = state.selectedAudioUrl;
      if (!audioId && state.audioSources.length > 0) {
        audioId = state.audioSources[0].source.url;
      }

      if (!audioId) {
        console.error("Cannot broadcast play: No audio available");
        return;
      }

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PLAY,
          trackTimeSeconds: trackTimeSeconds ?? state.getCurrentTrackPosition(),
          audioSource: audioId,
        },
      });
    },

    broadcastPause: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PAUSE,
          trackTimeSeconds: state.getCurrentTrackPosition(),
          audioSource: state.selectedAudioUrl,
        },
      });
    },

    broadcastReorder: (newOrder: AudioSourceType[]) => {
      const state = get();
      const { socket } = getSocket(state);

      // Optimistically update local state immediately to prevent snap-back animation
      const newAudioSources: AudioSourceState[] = newOrder.map((source) => {
        // Preserve existing state (buffer, status) for each track
        const existing = state.audioSources.find(
          (as) => as.source.url === source.url
        );
        return existing || { source, status: "idle" };
      });

      set({ audioSources: newAudioSources });

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.REORDER_AUDIO_SOURCES,
          reorderedAudioSources: newOrder,
        },
      });
    },

    startSpatialAudio: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.START_SPATIAL_AUDIO,
        },
      });
    },

    sendStopSpatialAudio: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.STOP_SPATIAL_AUDIO,
        },
      });
    },

    sendChatMessage: (text: string) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SEND_CHAT_MESSAGE,
          text,
        },
      });
    },

    processStopSpatialAudio: () => {
      set({ isSpatialAudioEnabled: false });
      set({ spatialConfig: undefined });

      // Apply final gain which will now just be the global volume
      get().applyFinalGain();
    },

    sendNTPRequest: () => {
      const state = get();
      const { socket } = getSocket(state);

      // Always send NTP request for continuous heartbeat, include current RTT
      _sendNTPRequest(socket, state.roundTripEstimate || undefined); // don't send 0 but undefined if not properly calc'd

      // Show warning if latency is high
      if (state.isSynced && state.roundTripEstimate > 750) {
        console.warn("Latency is very high (>750ms). Sync may be unstable.");
      }
    },

    resetNTPConfig() {
      set({
        ntpMeasurements: [],
        offsetEstimate: 0,
        roundTripEstimate: 0,
        isSynced: false,
      });
    },

    addNTPMeasurement: (measurement) =>
      set((state) => {
        let measurements = [...state.ntpMeasurements];

        // Rolling queue: keep only last MAX_NTP_MEASUREMENTS
        if (measurements.length >= MAX_NTP_MEASUREMENTS) {
          measurements = [...measurements.slice(1), measurement];
          if (!state.isSynced) {
            set({ isSynced: true });
          }
        } else {
          measurements.push(measurement);
        }

        // Always recalculate offset with current measurements
        const { averageOffset, averageRoundTrip } =
          calculateOffsetEstimate(measurements);

        return {
          ntpMeasurements: measurements,
          offsetEstimate: averageOffset,
          roundTripEstimate: averageRoundTrip,
        };
      }),
    onConnectionReset: () => {
      const state = get();

      // Stop spatial audio if enabled
      if (state.isSpatialAudioEnabled) {
        state.processStopSpatialAudio();
      }

      set({
        ntpMeasurements: [],
        offsetEstimate: 0,
        roundTripEstimate: 0,
        isSynced: false,
      });
    },

    getCurrentTrackPosition: () => {
      const state = get();
      const {
        audioPlayer,
        isPlaying,
        currentTime,
        playbackStartTime,
        playbackOffset,
      } = state; // Destructure for easier access

      if (!isPlaying || !audioPlayer) {
        return currentTime; // Return the saved position when paused or not initialized
      }

      const { audioContext } = audioPlayer;
      const elapsedSinceStart = audioContext.currentTime - playbackStartTime;
      // Ensure position doesn't exceed duration due to timing glitches
      return Math.min(playbackOffset + elapsedSinceStart, state.duration);
    },

    playAudio: async (data: {
      offset: number;
      when: number;
      audioIndex?: number;
    }) => {
      const state = get();
      const { sourceNode, audioContext, gainNode } = getAudioPlayer(state);

      // Before any audio playback, ensure the context is running
      if (audioContext.state !== "running") {
        console.log("AudioContext still suspended, aborting play");
        toast.error("Audio context is suspended. Please try again.");
        return;
      }

      // Stop any existing source node before creating a new one
      try {
        sourceNode.onended = null;
        sourceNode.disconnect();
        sourceNode.stop();
      } catch (_) {}

      const startTime = audioContext.currentTime + data.when;
      const audioIndex = data.audioIndex ?? 0;
      const audioSourceState = state.audioSources[audioIndex];
      if (!audioSourceState) {
        console.error(`No audio source at index ${audioIndex}`);
        return;
      }

      // Check if the audio is loaded
      if (audioSourceState.status === "loading") {
        toast.error("Track is still loading, please wait...");
        return;
      }
      if (audioSourceState.status === "error") {
        toast.error(
          `Track failed to load: ${audioSourceState.error || "Unknown error"}`
        );
        return;
      }
      if (audioSourceState.status === "idle") {
        console.error("Track is in idle state");
        return;
      }

      const audioBuffer = audioSourceState.buffer;
      if (!audioBuffer) {
        console.error(
          `No audio buffer for url: ${audioSourceState.source.url}`
        );
        return;
      }

      // Validate offset is within track duration to prevent sync failures
      if (data.offset >= audioBuffer.duration) {
        console.error(
          `Sync offset ${data.offset.toFixed(
            2
          )}s is beyond track duration ${audioBuffer.duration.toFixed(
            2
          )}s. Aborting playback.`
        );
        return;
      }

      // Create a new source node using singleton
      const newSourceNode = audioContextManager.createBufferSource();
      newSourceNode.buffer = audioBuffer;
      newSourceNode.connect(gainNode);

      // Autoplay: Handle track ending naturally
      newSourceNode.onended = () => {
        const currentState = get();
        const { audioPlayer: currentPlayer, isPlaying: currentlyIsPlaying } =
          currentState; // Get fresh state

        // Only process if the player was 'isPlaying' right before this event fired
        // and the sourceNode that ended is the *current* sourceNode.
        // This prevents handlers from old nodes interfering after a quick skip.
        if (currentlyIsPlaying && currentPlayer?.sourceNode === newSourceNode) {
          const { audioContext } = currentPlayer;
          // Check if the buffer naturally reached its end
          // Calculate the expected end time in the AudioContext timeline
          const expectedEndTime =
            currentState.playbackStartTime +
            (currentState.duration - currentState.playbackOffset);
          // Use a tolerance for timing discrepancies (e.g., 0.5 seconds)
          const endedNaturally =
            Math.abs(audioContext.currentTime - expectedEndTime) < 0.5;

          if (endedNaturally) {
            console.log(
              "Track ended naturally, skipping to next via autoplay."
            );
            // Set currentTime to duration, as playback fully completed
            // We don't set isPlaying false here, let skipToNextTrack handle state transition
            set({ currentTime: currentState.duration });
            currentState.skipToNextTrack(true); // Trigger autoplay skip
          } else {
            console.log(
              "onended fired but not deemed a natural end (likely manual stop/skip). State should be handled elsewhere."
            );
            // If stopped manually (pauseAudio) or skipped (setSelectedAudioId),
            // those functions are responsible for setting isPlaying = false and currentTime.
            // No action needed here for non-natural ends.
          }
        } else {
          console.log(
            "onended fired but player was already stopped/paused or source node changed."
          );
        }
      };

      newSourceNode.start(startTime, data.offset);
      console.log(
        "Started playback at offset:",
        data.offset,
        "with delay:",
        data.when,
        "audio index:",
        audioIndex
      );

      // Update state with the new source node and tracking info
      set((state) => ({
        ...state,
        audioPlayer: {
          ...state.audioPlayer!,
          sourceNode: newSourceNode,
        },
        isPlaying: true,
        playbackStartTime: startTime,
        playbackOffset: data.offset,
        duration: audioBuffer.duration, // Set the duration
      }));
    },

    processSpatialConfig: (config: SpatialConfigType) => {
      const state = get();
      set({ spatialConfig: config });
      const { listeningSource } = config;

      // Don't set if we were the ones dragging the listening source
      if (!state.isDraggingListeningSource) {
        set({ listeningSourcePosition: listeningSource });
      }

      // Use the shared applyFinalGain method which handles global volume multiplication
      const clientId = getClientId();
      const user = config.gains[clientId];
      if (!user) {
        console.error(`No gain config found for client ${clientId}`);
        return;
      }

      // The rampTime comes from the server-side spatial config
      state.applyFinalGain(user.rampTime);
    },

    pauseAudio: (data: { when: number }) => {
      const state = get();
      const { sourceNode, audioContext } = getAudioPlayer(state);

      const stopTime = audioContext.currentTime + data.when;
      sourceNode.stop(stopTime);

      // Calculate current position in the track at the time of pausing
      const elapsedSinceStart = stopTime - state.playbackStartTime;
      const currentTrackPosition = state.playbackOffset + elapsedSinceStart;

      console.log(
        "Stopping at:",
        data.when,
        "Current track position:",
        currentTrackPosition
      );

      set((state) => ({
        ...state,
        isPlaying: false,
        currentTime: currentTrackPosition,
      }));
    },

    setListeningSourcePosition: (position: PositionType) => {
      set({ listeningSourcePosition: position });
    },

    setIsDraggingListeningSource: (isDragging) => {
      set({ isDraggingListeningSource: isDragging });
    },

    setConnectedClients: (clients) => {
      const clientId = getClientId();
      const currentUser = clients.find(
        (client) => client.clientId === clientId
      );

      if (!currentUser) {
        throw new Error(
          `Current user not found in connected clients: ${clientId}`
        );
      }

      set({ connectedClients: clients, currentUser });
    },

    skipToNextTrack: (isAutoplay = false) => {
      // Accept optional isAutoplay flag
      const state = get();
      const {
        audioSources: audioSources,
        selectedAudioUrl: selectedAudioId,
        isShuffled,
      } = state;
      if (audioSources.length <= 1) return; // Can't skip if only one track

      const currentIndex = state.findAudioIndexByUrl(selectedAudioId);
      if (currentIndex === null) return;

      let nextIndex: number;
      if (isShuffled) {
        // Shuffle logic: pick a random index DIFFERENT from the current one
        do {
          nextIndex = Math.floor(Math.random() * audioSources.length);
        } while (nextIndex === currentIndex);
      } else {
        // Normal sequential logic
        nextIndex = (currentIndex + 1) % audioSources.length;
      }

      const nextAudioId = audioSources[nextIndex].source.url;
      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.changeAudioSource(nextAudioId);

      // If the track was playing before a manual skip OR if this is an autoplay event,
      // start playing the next track from the beginning.
      if (wasPlayingBeforeSkip || isAutoplay) {
        console.log(
          `Skip to next: ${nextAudioId}. Was playing: ${wasPlayingBeforeSkip}, Is autoplay: ${isAutoplay}. Broadcasting play.`
        );
        state.broadcastPlay(0); // Play next track from start
      } else {
        console.log(
          `Skip to next: ${nextAudioId}. Was playing: ${wasPlayingBeforeSkip}, Is autoplay: ${isAutoplay}. Not broadcasting play.`
        );
      }
    },

    skipToPreviousTrack: () => {
      const state = get();
      const {
        audioSources,
        selectedAudioUrl: selectedAudioId /* isShuffled */,
      } = state; // Note: isShuffled is NOT used here currently
      if (audioSources.length === 0) return;

      const currentIndex = state.findAudioIndexByUrl(selectedAudioId);
      if (currentIndex === null) return;

      // Previous track always goes to the actual previous in the list, even if shuffled
      // This is a common behavior, but could be changed if needed.
      const prevIndex =
        (currentIndex - 1 + audioSources.length) % audioSources.length;
      const prevAudioId = audioSources[prevIndex].source.url;

      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.changeAudioSource(prevAudioId);

      // If the track was playing before the manual skip, start playing the previous track.
      if (wasPlayingBeforeSkip) {
        console.log(
          `Skip to previous: ${prevAudioId}. Was playing: ${wasPlayingBeforeSkip}. Broadcasting play.`
        );
        state.broadcastPlay(0); // Play previous track from start
      } else {
        console.log(
          `Skip to previous: ${prevAudioId}. Was playing: ${wasPlayingBeforeSkip}. Not broadcasting play.`
        );
      }
    },

    toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

    setIsSpatialAudioEnabled: (isEnabled) =>
      set({ isSpatialAudioEnabled: isEnabled }),

    getCurrentGainValue: () => {
      const state = get();
      if (!state.audioPlayer) return 1; // Default value if no player
      return state.audioPlayer.gainNode.gain.value;
    },

    getCurrentSpatialGainValue: () => {
      const state = get();
      if (!state.spatialConfig) return 1; // Default value if no spatial config
      const clientId = getClientId();
      return state.spatialConfig.gains[clientId].gain;
    },

    setGlobalVolume: (volume) => {
      set({ globalVolume: Math.max(0, Math.min(1, volume)) });
      get().applyFinalGain();
    },

    sendGlobalVolumeUpdate: (volume) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SET_GLOBAL_VOLUME,
          volume,
        },
      });
    },

    processGlobalVolumeConfig: (config: GlobalVolumeConfigType) => {
      const { volume, rampTime } = config;
      set({ globalVolume: volume });
      get().applyFinalGain(rampTime);
    },

    applyFinalGain: (rampTime = 0.1) => {
      const state = get();

      // Calculate final gain
      let finalGain = state.globalVolume;

      // If spatial audio is enabled, get the spatial gain for this client
      if (state.isSpatialAudioEnabled && state.spatialConfig) {
        const clientId = getClientId();
        const spatialGain = state.spatialConfig.gains[clientId]?.gain || 1;
        finalGain = state.globalVolume * spatialGain;
      }

      // Use singleton's setMasterGain with ramping
      audioContextManager.setMasterGain(finalGain, rampTime);
    },

    getAudioDuration: ({ url }) => {
      const state = get();
      const audioSource = state.audioSources.find(
        (as) => as.source.url === url
      );
      if (
        !audioSource ||
        audioSource.status !== "loaded" ||
        !audioSource.buffer
      ) {
        // Return 0 for loading/error states or not found
        return 0;
      }
      return audioSource.buffer.duration;
    },

    getSelectedTrack: () => {
      const state = get();
      if (!state.selectedAudioUrl) return null;

      return (
        state.audioSources.find(
          (as) => as.source.url === state.selectedAudioUrl
        ) || null
      );
    },

    async handleSetAudioSources({ sources, currentAudioSource }) {
      // Wait for audio initialization to complete if it's in progress
      if (initializationMutex.isLocked()) {
        await initializationMutex.waitForUnlock();
      }

      const state = get();

      // Clean up buffer access queue - remove URLs that are no longer in the playlist
      // const newUrls = new Set(sources.map((s) => s.url));
      // const updatedQueue = state.bufferAccessQueue.filter((url) =>
      //   newUrls.has(url)
      // );

      // Build completely new queue based on sources order
      const newQueue: string[] = [];
      
      // Add current/selected track first (highest priority)
      if (currentAudioSource && sources.some(s => s.url === currentAudioSource)) {
        newQueue.push(currentAudioSource);
      } else if (state.selectedAudioUrl && sources.some(s => s.url === state.selectedAudioUrl)) {
        newQueue.push(state.selectedAudioUrl);
      }
      
      // Add remaining tracks in playlist order
      sources.forEach(source => {
        if (!newQueue.includes(source.url)) {
          newQueue.push(source.url);
        }
      });

      // Create new audioSources array (preserving loaded buffers for tracks still in playlist)
      const newAudioSources: AudioSourceState[] = sources.map((source) => {
        // Try to preserve the status of the currently playing/selected track
        if (
          source.url === state.selectedAudioUrl ||
          source.url === currentAudioSource
        ) {
          const existing = state.audioSources.find(
            (as) => as.source.url === source.url
          );
          if (existing) {
            return existing;
          }
        }
        return {
          source,
          status: "idle",
        };
      });

      // Update state immediately to show all sources (with idle states) and cleaned queue
      set({ audioSources: newAudioSources, bufferAccessQueue: newQueue });

      // If currentAudioSource is provided from server, update selectedAudioUrl and start loading it
      if (currentAudioSource) {
        set({ selectedAudioUrl: currentAudioSource });
        loadAudioSource(currentAudioSource);
      }

      // Check if the currently selected/playing track was removed
      const currentStillExists = newAudioSources.some(
        (as) => as.source.url === state.selectedAudioUrl
      );

      if (!currentStillExists && state.selectedAudioUrl) {
        // Stop playback if current track was removed
        if (state.isPlaying) {
          state.pauseAudio({ when: 0 });
        }

        // Clear selected track - don't auto-select another
        set({ selectedAudioUrl: "" });
      }
    },

    // Reset function to clean up state
    resetStore: () => {
      const state = get();

      // Stop any playing audio
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.onended = null; // Remove handler
          state.audioPlayer.sourceNode.disconnect(); // Disconnect from graph
          state.audioPlayer.sourceNode.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
      }

      // Close the websocket connection if it exists
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.close();
      }

      // DON'T close the AudioContext - keep singleton alive!
      // The AudioContext persists for the app lifetime

      // Reset state to initial values
      set({
        ...initialState,
      });

      // Reinitialize audio player state (but reuse the same context)
      initializeAudioExclusively();
    },
    setReconnectionInfo: (info) => set({ reconnectionInfo: info }),
    setPlaybackControlsPermissions: (permissions) =>
      set({ playbackControlsPermissions: permissions }),

    // Search methods
    setSearchResults: (results, append = false) => {
      if (append && results?.type === "success") {
        const state = get();
        if (state.searchResults?.type === "success") {
          // Append new results to existing ones
          const existingItems = state.searchResults.response.data.tracks.items;
          const newItems = results.response.data.tracks.items;
          const combinedResults = {
            ...results,
            response: {
              ...results.response,
              data: {
                ...results.response.data,
                tracks: {
                  ...results.response.data.tracks,
                  items: [...existingItems, ...newItems],
                },
              },
            },
          };
          set({ searchResults: combinedResults });
          return;
        }
      }
      set({ searchResults: results });
    },
    setIsSearching: (isSearching) => set({ isSearching }),
    setIsLoadingMoreResults: (isLoading) =>
      set({ isLoadingMoreResults: isLoading }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchOffset: (offset) => set({ searchOffset: offset }),
    setHasMoreResults: (hasMore) => set({ hasMoreResults: hasMore }),
    clearSearchResults: () =>
      set({
        searchResults: null,
        isSearching: false,
        isLoadingMoreResults: false,
        searchQuery: "",
        searchOffset: 0,
        hasMoreResults: false,
      }),
    loadMoreSearchResults: () => {
      const state = get();
      const { socket, searchQuery, searchOffset, isLoadingMoreResults } = state;

      if (!socket || !searchQuery || isLoadingMoreResults) {
        console.error("Cannot load more results: missing requirements");
        return;
      }

      // Calculate next offset based on current results
      const currentResults =
        state.searchResults?.type === "success"
          ? state.searchResults.response.data.tracks.items.length
          : 0;
      const nextOffset = searchOffset + currentResults;

      console.log("Loading more search results", { searchQuery, nextOffset });

      // Set loading state
      state.setIsLoadingMoreResults(true);
      state.setSearchOffset(nextOffset);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SEARCH_MUSIC,
          query: searchQuery,
          offset: nextOffset,
        },
      });
    },

    // Stream job methods
    setActiveStreamJobs: (count) => set({ activeStreamJobs: count }),

    // Audio source methods
    handleLoadAudioSource: ({ audioSourceToPlay }: LoadAudioSourceType) => {
      set({ selectedAudioUrl: audioSourceToPlay.url });
      loadAudioSource(audioSourceToPlay.url);
    },
  };
});
