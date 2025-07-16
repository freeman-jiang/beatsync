import { LocalAudioSource, RawAudioSource, YouTubeSource } from "@/lib/localTypes";
import {
  NTPMeasurement,
  _sendNTPRequest,
  calculateOffsetEstimate,
  calculateWaitTimeMilliseconds,
} from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  AudioSourceType,
  ClientActionEnum,
  ClientType,
  GRID,
  PositionType,
  SpatialConfigType,
  NTP_CONSTANTS,
} from "@beatsync/shared";
import { toast } from "sonner";
import { create } from "zustand";
import { useRoomStore } from "./room";
import { fetchDefaultAudioSources } from "@/lib/api";
import type { YouTubeEvent } from "react-youtube";

export const MAX_NTP_MEASUREMENTS = NTP_CONSTANTS.MAX_MEASUREMENTS;

// https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch02.html

interface AudioPlayerState {
  audioContext: AudioContext;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

enum AudioPlayerError {
  NotInitialized = "NOT_INITIALIZED",
}

// Interface for just the state values (without methods)
interface GlobalStateValues {
  // Audio Sources
  audioSources: LocalAudioSource[]; // Playlist order, server-synced, based on URL
  audioCache: Map<string, AudioBuffer>; // URL -> AudioBuffer
  isInitingSystem: boolean;
  hasUserStartedSystem: boolean; // Track if user has clicked "Start System" at least once
  selectedAudioUrl: string;
  selectedAudioId: string;
  downloadedAudioIds: Set<string>;

  // YouTube Sources
  youtubeSources: YouTubeSource[];
  selectedYouTubeId: string;
  isYouTubePlayerReady: boolean;
  youtubePlayer: YouTubeEvent['target'] | null;
  
  // UI Mode
  currentMode: 'library' | 'youtube';

  // Websocket
  socket: WebSocket | null;
  lastMessageReceivedTime: number | null;

  // Spatial audio
  spatialConfig?: SpatialConfigType;
  listeningSourcePosition: PositionType;
  isDraggingListeningSource: boolean;
  isSpatialAudioEnabled: boolean;

  // Connected clients
  connectedClients: ClientType[];

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

  // Tracking properties
  playbackStartTime: number;
  playbackOffset: number;

  // Shuffle state
  isShuffled: boolean;
  
  // Repeat mode
  repeatMode: 'none' | 'all' | 'one';
  reconnectionInfo: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  };

  // Audio system status
  isAudioSystemReady: boolean;
  pendingPlaybackSync: {
    isPlaying: boolean;
    currentTime: number;
  } | null;
  pendingRoomState: {
    selectedAudioId?: string;
    selectedYouTubeId?: string;
    mode?: string;
    playbackSync?: {
      isPlaying: boolean;
      currentTime: number;
      lastUpdated: number;
    };
  } | null;
}

interface GlobalState extends GlobalStateValues {
  // Methods
  getAudioDuration: ({ url }: { url: string }) => number;
  handleSetAudioSources: ({ sources }: { sources: AudioSourceType[] }) => void;

  setIsInitingSystem: (isIniting: boolean) => void;
  reorderClient: (clientId: string) => void;
  setSelectedAudioUrl: (url: string) => boolean;
  setSelectedAudioId: (id: string, skipBroadcast?: boolean) => void;
  broadcastSelectedAudioChange: (audioId: string) => void;
  findAudioIndexByUrl: (url: string) => number | null;
  hasDownloadedAudio: (id: string) => boolean;
  markAudioAsDownloaded: (id: string) => void;
  setAudioSources: (sources: LocalAudioSource[]) => void;
  addAudioSource: (source: RawAudioSource) => Promise<void>;
  addToUploadHistory?: (name: string, id: string) => void;
  schedulePlay: (data: {
    trackTimeSeconds: number;
    targetServerTime: number;
    audioId: string;
  }) => void;
  schedulePause: (data: { targetServerTime: number }) => void;
  setSocket: (socket: WebSocket) => void;
  broadcastPlay: (trackTimeSeconds?: number) => void;
  broadcastPause: () => void;
  startSpatialAudio: () => void;
  sendStopSpatialAudio: () => void;
  setSpatialConfig: (config: SpatialConfigType) => void;
  updateListeningSource: (position: PositionType) => void;
  setListeningSourcePosition: (position: PositionType) => void;
  setIsDraggingListeningSource: (isDragging: boolean) => void;
  setIsSpatialAudioEnabled: (isEnabled: boolean) => void;
  processStopSpatialAudio: () => void;
  setConnectedClients: (clients: ClientType[]) => void;
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
  setVolume: (volume: number) => void;
  getVolume: () => number;
  resetStore: () => void;
  // YouTube methods
  addYouTubeSource: (source: Omit<YouTubeSource, 'addedAt' | 'addedBy'>) => Promise<void>;
  setYouTubeSources: (sources: YouTubeSource[]) => void;
  setSelectedYouTubeId: (videoId: string) => void;
  setYouTubePlayerReady: (isReady: boolean) => void;
  setYouTubePlayer: (player: YouTubeEvent['target'] | null) => void;
  broadcastPlayYouTube: (timeSeconds?: number) => void;
  broadcastPauseYouTube: () => void;
  broadcastSeekYouTube: (timeSeconds: number) => void;
  schedulePlayYouTube: (data: {
    videoId: string;
    timeSeconds: number;
    targetServerTime: number;
  }) => void;
  schedulePauseYouTube: (data: {
    videoId: string;
    targetServerTime: number;
  }) => void;
  scheduleSeekYouTube: (data: {
    videoId: string;
    timeSeconds: number;
    targetServerTime: number;
  }) => void;

  // Player controls
  setIsShuffled: (shuffled: boolean) => void;
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  playNextYouTubeVideo: () => void;
  playPreviousYouTubeVideo: () => void;
  skipToNextYouTubeVideo: () => void;
  skipToPreviousYouTubeVideo: () => void;
  // UI Mode methods
  setCurrentMode: (mode: 'library' | 'youtube') => void;
  broadcastModeChange: (mode: 'library' | 'youtube') => void;
  broadcastAddYouTubeSource: (source: Omit<YouTubeSource, 'addedAt' | 'addedBy'>) => void;
  removeYouTubeSource: (videoId: string) => void;
  setReconnectionInfo: (info: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  }) => void;

  // Audio system state management
  setIsAudioSystemReady: (ready: boolean) => void;
  setPendingPlaybackSync: (syncData: { isPlaying: boolean; currentTime: number } | null) => void;
  setPendingRoomState: (roomState: {
    selectedAudioId?: string;
    selectedYouTubeId?: string;
    mode?: string;
    playbackSync?: {
      isPlaying: boolean;
      currentTime: number;
      lastUpdated: number;
    };
  } | null) => void;
  applyPendingRoomState: () => void;
}

// Define initial state values
const initialState: GlobalStateValues = {
  // Audio Sources
  audioSources: [],
  audioCache: new Map(),

  // Audio playback state
  isPlaying: false,
  currentTime: 0,
  playbackStartTime: 0,
  playbackOffset: 0,
  selectedAudioUrl: "",
  selectedAudioId: "",
  downloadedAudioIds: new Set(),

  // Spatial audio
  isShuffled: false,
  repeatMode: 'none' as const,
  isSpatialAudioEnabled: false,
  isDraggingListeningSource: false,
  listeningSourcePosition: { x: GRID.SIZE / 2, y: GRID.SIZE / 2 },
  spatialConfig: undefined,

  // Network state
  socket: null,
  lastMessageReceivedTime: null,
  connectedClients: [],

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

  // YouTube state
  youtubeSources: [],
  selectedYouTubeId: "",
  isYouTubePlayerReady: false,
  youtubePlayer: null,
  
  // UI Mode
  currentMode: 'library',
  reconnectionInfo: {
    isReconnecting: false,
    currentAttempt: 0,
    maxAttempts: 0,
  },

  // Audio system status
  isAudioSystemReady: false,
  pendingPlaybackSync: null,
  pendingRoomState: null,
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

const loadAudioSourceUrl = async ({
  url,
  audioContext,
}: {
  url: string;
  audioContext: AudioContext;
}) => {
  console.log("loadAudioSourceUrl called with URL:", url);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`Fetched audio buffer for ${url}, size: ${arrayBuffer.byteLength} bytes`);
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error(`Empty audio buffer for URL: ${url}`);
    }
    
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(`Successfully decoded audio buffer for ${url}, duration: ${audioBuffer.duration}s`);
    
    return {
      audioBuffer,
    };
  } catch (error) {
    console.error(`Error loading audio from ${url}:`, error);
    throw new Error(`Audio buffer not decoded for url: ${url}. ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Web audio API
const initializeAudioContext = () => {
  const audioContext = new AudioContext();
  return audioContext;
};

export const useGlobalStore = create<GlobalState>((set, get) => {
  // Track loading states to prevent duplicate loading attempts
  const loadingStates = new Map<string, Promise<AudioBuffer>>();

  // Function to initialize audio system without default sources
  const initializeAudio = async () => {
    console.log("initializeAudio() - skipping default sources");

    // Create fresh audio context
    const audioContext = initializeAudioContext();

    // Create master gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1; // Default volume
    gainNode.connect(audioContext.destination); // Connect gain node to speakers

    set({
      audioSources: [], // Start with no audio sources
      audioPlayer: {
        audioContext,
        sourceNode: audioContext.createBufferSource(), // Create empty source node
        gainNode,
      },
      downloadedAudioIds: new Set<string>(),
      duration: 0, // No initial duration
      selectedAudioId: undefined, // No initial selection
      isAudioSystemReady: true, // Mark audio system as ready
    });

    console.log("Audio system initialized without default sources");
  };

  // Function to ensure audio system is initialized and load audio buffer for a specific source
  const ensureAudioLoaded = async (audioSource: LocalAudioSource): Promise<AudioBuffer> => {
    let state = get();
    
    // Check if we already have the audio buffer
    if (audioSource.audioBuffer) {
      return audioSource.audioBuffer;
    }
    
    const cachedBuffer = state.audioCache.get(audioSource.url);
    if (cachedBuffer) {
      return cachedBuffer;
    }
    
    // Check if this audio is already being loaded to prevent duplicate requests
    const existingLoad = loadingStates.get(audioSource.url);
    if (existingLoad) {
      console.log("Audio already loading, waiting for existing load:", audioSource.url);
      return existingLoad;
    }
    
    // Ensure audio context exists
    if (!state.audioPlayer?.audioContext) {
      const audioContext = new AudioContext();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;
      gainNode.connect(audioContext.destination);
      
      set({
        audioPlayer: {
          audioContext,
          sourceNode: audioContext.createBufferSource(),
          gainNode,
        },
        isAudioSystemReady: true, // Mark as ready since we just created it
      });
      
      // Get fresh state after setting the audio player
      state = get();
    }
    
    // Create and store the loading promise
    const loadingPromise = (async () => {
      try {
        console.log("Loading audio buffer for:", audioSource.url);
        const { audioBuffer } = await loadAudioSourceUrl({
          url: audioSource.url,
          audioContext: state.audioPlayer!.audioContext,
        });
        
        // Update the audio source with the buffer and cache it
        set((currentState) => {
          const updatedSources = currentState.audioSources.map(source =>
            source.id === audioSource.id 
              ? { ...source, audioBuffer, duration: audioBuffer.duration }
              : source
          );
          
          const newCache = new Map(currentState.audioCache);
          newCache.set(audioSource.url, audioBuffer);
          
          return {
            audioSources: updatedSources,
            audioCache: newCache,
          };
        });
        
        console.log("✓ Successfully loaded audio buffer for:", audioSource.name);
        return audioBuffer;
      } finally {
        // Remove from loading states when done (success or failure)
        loadingStates.delete(audioSource.url);
      }
    })();
    
    // Store the loading promise
    loadingStates.set(audioSource.url, loadingPromise);
    
    return loadingPromise;
  };

  // Function to load default audio files from the server
  const loadDefaultAudio = async () => {
    try {
      console.log("Loading default audio files...");
      const defaultAudioList = await fetchDefaultAudioSources();
      console.log("Default audio list received:", defaultAudioList);
      
      // Don't create AudioContext yet - just prepare the audio sources list
      // AudioContext will be created on first user interaction
      const audioSources: LocalAudioSource[] = defaultAudioList.map((audioFile) => ({
        id: audioFile.url,
        url: audioFile.url,
        name: audioFile.url.split('/').pop() || audioFile.url,
        // audioBuffer will be loaded lazily when needed
        // duration will be populated when audio is first accessed
      }));

      set(({
        audioSources,
        selectedAudioId: audioSources.length > 0 ? audioSources[0].id : undefined,
      }));
      
      console.log(`✓ Prepared ${audioSources.length} default audio sources for lazy loading`);
    } catch (error) {
      console.error("Failed to load default audio files:", error);
      toast.error("Failed to load default audio files");
    }
  };

  if (typeof window !== "undefined") {
    // @ts-expect-error only exists for iOS
    if (window.navigator.audioSession) {
      // @ts-expect-error only exists for iOS
      window.navigator.audioSession.type = "playback";
    }

    console.log("Initializing audio system");
    initializeAudio().then(() => {
      // Load default audio files after audio system is initialized
      loadDefaultAudio();
    });
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

    hasDownloadedAudio: (id) => {
      const state = get();
      return state.downloadedAudioIds.has(id);
    },

    markAudioAsDownloaded: (id) => {
      set((state) => {
        const newSet = new Set(state.downloadedAudioIds);
        newSet.add(id);
        return { downloadedAudioIds: newSet };
      });
    },

    setAudioSources: (sources) => {
      set({ audioSources: sources });
      // Apply any pending room state now that audio sources are available
      const state = get();
      if (state.pendingRoomState && sources.length > 0) {
        state.applyPendingRoomState();
      }
    },

    setSelectedAudioId: (id: string, skipBroadcast?: boolean) => {
      set({ selectedAudioId: id });
      // Only broadcast if not explicitly skipped (to avoid infinite loops from WebSocket events)
      if (!skipBroadcast) {
        const state = get();
        state.broadcastSelectedAudioChange(id);
      }
    },

    broadcastSelectedAudioChange: (audioId: string) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SET_SELECTED_AUDIO,
          audioId,
        },
      });
    },

    getAudioDuration: ({ url }: { url: string }) => {
      console.log("getAudioDuration called with URL:", url);
      const state = get();
      
      // First check the audio cache
      const cachedBuffer = state.audioCache.get(url);
      if (cachedBuffer) {
        console.log("Audio buffer found in cache:", cachedBuffer.duration);
        return cachedBuffer.duration;
      }
      
      // If not in cache, check if any audio source has this URL and has a loaded buffer
      const audioSource = state.audioSources.find(source => source.url === url);
      if (audioSource?.audioBuffer) {
        console.log("Audio buffer found in source:", audioSource.audioBuffer.duration);
        return audioSource.audioBuffer.duration;
      }
      
      // If still not found, check if any audio source has a duration (from metadata)
      if (audioSource?.duration) {
        console.log("Duration found in source metadata:", audioSource.duration);
        return audioSource.duration;
      }
      
      // If audio source exists but buffer isn't loaded, trigger background loading
      // But only if it's not already being loaded
      if (audioSource && !audioSource.audioBuffer && !loadingStates.has(audioSource.url)) {
        console.log("Audio buffer not loaded yet, triggering background load for:", url);
        // Defer async loading to avoid React render cycle warnings
        setTimeout(() => {
          ensureAudioLoaded(audioSource).catch(error => {
            console.warn("Background audio loading failed:", error);
          });
        }, 0);
      } else if (loadingStates.has(audioSource?.url || url)) {
        console.log("Audio is already being loaded:", url);
      }
      
      console.log("Audio buffer not found for URL:", url);
      return 0;
    },

    handleSetAudioSources: ({ sources }: { sources: AudioSourceType[] }) => {
      set({ audioSources: sources.map(source => ({ 
        id: source.url, 
        url: source.url 
      })) });
    },

    addToUploadHistory: (name: string, id: string) => {
      // Optional method - can be implemented later if needed
      console.log(`Added to upload history: ${name} (${id})`);
    },

    setReconnectionInfo: (info: {
      isReconnecting: boolean;
      currentAttempt: number;
      maxAttempts: number;
    }) => set({ reconnectionInfo: info }),

    addAudioSource: async (source: RawAudioSource) => {
      const state = get();
      let audioContext = state.audioPlayer?.audioContext;
      
      // If no audio context exists, create one
      if (!audioContext) {
        console.log("No audio context found, creating new one for audio processing");
        audioContext = new AudioContext();
        
        // Create the full audio player state if it doesn't exist
        if (!state.audioPlayer) {
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1;
          gainNode.connect(audioContext.destination); // Connect to speakers
          const sourceNode = audioContext.createBufferSource();
          
          set({
            audioPlayer: {
              audioContext,
              sourceNode,
              gainNode,
            },
          });
        }
      }

      try {
        const audioBuffer = await audioContext.decodeAudioData(
          source.audioBuffer
        );
        console.log(
          "Decoded audio setting state to add audio source",
          source.name
        );

        // Add to upload history when adding an audio source
        // If this has an ID, mark it as downloaded
        state.markAudioAsDownloaded(source.id);
        if (state.addToUploadHistory) {
          state.addToUploadHistory(source.name, source.id);
        }

        const newAudioSource: LocalAudioSource = {
          id: source.id,
          name: source.name,
          url: `blob:audio-${source.id}`, // Create a unique URL for the audio source
          audioBuffer,
          duration: audioBuffer.duration,
        };

        set((state) => {
          // If this is the currently selected audio, update the duration
          const shouldUpdateDuration = source.id === state.selectedAudioId;
          
          // Auto-select this audio if no audio is currently selected
          const shouldSelectThisAudio = !state.selectedAudioId || state.audioSources.length === 0;

          return {
            audioSources: [...state.audioSources, newAudioSource],
            ...(shouldUpdateDuration ? { duration: audioBuffer.duration } : {}),
            ...(shouldSelectThisAudio ? { 
              selectedAudioId: source.id,
              duration: audioBuffer.duration 
            } : {}),
          };
        });
      } catch (error) {
        console.error("Failed to decode audio data:", error);
        toast.error("Failed to process audio file");
      }
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

        const audioContext = state.audioPlayer?.audioContext;
        // Modern browsers require user interaction before playing audio
        // If context is suspended, we need to resume it
        if (audioContext && audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("AudioContext resumed via user gesture");
            // Mark audio system as ready now that context is active
            set({ isAudioSystemReady: true });
          } catch (err) {
            console.warn("Failed to resume AudioContext", err);
          }
        } else if (audioContext && audioContext.state === "running") {
          // Context is already running, mark as ready
          set({ isAudioSystemReady: true });
        }
      }

      // Update the initialization state
      set({ isInitingSystem: isIniting });
    },

    setSelectedAudioUrl: (url) => {
      const state = get();

      // Stop any current playback immediately when switching tracks
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch {
          // Ignore errors if already stopped or not initialized
        }
      }

      // Find the audio source by URL and get its ID
      const audioSource = state.audioSources.find(source => source.url === url);
      if (!audioSource) {
        console.error(`Audio source not found for URL: ${url}`);
        return false;
      }

      set({
        selectedAudioUrl: url,
        selectedAudioId: audioSource.id,
        isPlaying: false,
        currentTime: 0,
        playbackStartTime: 0,
        playbackOffset: 0,
        duration: audioSource.duration || 0,
      });

      // Broadcast the audio selection change to other clients
      state.broadcastSelectedAudioChange(audioSource.id);

      return true;
    },

    findAudioIndexByUrl: (url: string) => {
      const state = get();
      // Look through the audioSources for a matching ID
      const index = state.audioSources.findIndex(
        (source) => source.url === url
      );
      return index >= 0 ? index : null; // Return null if not found
    },

    schedulePlay: (data: {
      trackTimeSeconds: number;
      targetServerTime: number;
      audioId: string;
    }) => {
      const state = get();
      if (state.isInitingSystem) {
        console.log("Not playing audio, still loading");
        // Non-interactive state, can't play audio
        return;
      }

      // Check if audio player is initialized, if not, try to initialize it
      if (!state.audioPlayer) {
        console.log("Audio player not initialized, attempting to initialize...");
        // Try to initialize the audio system
        const audioContext = new AudioContext();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        gainNode.connect(audioContext.destination); // Connect to speakers
        const sourceNode = audioContext.createBufferSource();
        
        set({
          audioPlayer: {
            audioContext,
            sourceNode,
            gainNode,
          },
        });
        
        console.log("Audio player initialized");
      }

      const waitTimeSeconds = getWaitTimeSeconds(state, data.targetServerTime);
      console.log(
        `Playing track ${data.audioId} at ${data.trackTimeSeconds} seconds in ${waitTimeSeconds}`
      );

      // Update the selected audio ID
      if (data.audioId !== state.selectedAudioUrl) {
        set({ selectedAudioUrl: data.audioId });
      }

      // Find the index of the audio to play
      const audioIndex = state.findAudioIndexByUrl(data.audioId);
      if (audioIndex === null) {
        console.error(
          `Cannot play audio: No index found: ${data.audioId} ${data.trackTimeSeconds}`
        );
        toast.error("Audio file not found. Please reupload the audio file.");
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
      console.log(`Scheduling pause in ${waitTimeSeconds}s (isPlaying: ${state.isPlaying})`);

      state.pauseAudio({
        when: waitTimeSeconds,
      });
    },

    setSocket: (socket) => set({ socket }),

    broadcastPlay: (trackTimeSeconds?: number) => {
      const state = get();
      const { socket } = getSocket(state);

      // Use selected audio or fall back to first audio source
      let audioId = state.selectedAudioId;
      if (!audioId && state.audioSources.length > 0) {
        audioId = state.audioSources[0].id;
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
          audioId,
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

    processStopSpatialAudio: () => {
      const state = get();

      const { gainNode } = getAudioPlayer(state);
      gainNode.gain.cancelScheduledValues(0);
      gainNode.gain.value = 1;

      set({ isSpatialAudioEnabled: false });
      set({ spatialConfig: undefined });
    },

    sendNTPRequest: () => {
      const state = get();
      const { socket } = getSocket(state);

      // Always send NTP request for continuous heartbeat
      _sendNTPRequest(socket);

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
      
      // Ensure we have an audio player before trying to play
      if (!state.audioPlayer) {
        console.error("Cannot play audio: Audio player not initialized");
        toast.error("Audio system not ready. Please try again.");
        return;
      }
      
      const { sourceNode, audioContext, gainNode } = state.audioPlayer;

      // Before any audio playback, ensure the context is running
      if (audioContext.state !== "running") {
        console.log("AudioContext still suspended, attempting to resume...");
        try {
          await audioContext.resume();
          console.log("AudioContext resumed successfully");
        } catch (error) {
          console.error("Failed to resume AudioContext:", error);
          toast.error("Audio context is suspended. Please try again.");
          return;
        }
      }

      // Stop any existing source node before creating a new one
      try {
        sourceNode.stop();
      } catch {
        
      }

      const startTime = audioContext.currentTime + data.when;
      const audioIndex = data.audioIndex ?? 0;
      
      // Ensure we have audio sources and the index is valid
      if (!state.audioSources || state.audioSources.length === 0) {
        console.error("No audio sources available");
        toast.error("No audio files available to play");
        return;
      }
      
      if (audioIndex >= state.audioSources.length) {
        console.error(`Invalid audio index: ${audioIndex}`);
        toast.error("Audio file not found");
        return;
      }
      
      const audioSource = state.audioSources[audioIndex];
      
      // Ensure the audio buffer is loaded
      let audioBuffer;
      try {
        audioBuffer = await ensureAudioLoaded(audioSource);
      } catch (error) {
        console.error("Failed to load audio buffer:", error);
        toast.error(`Failed to load audio: ${audioSource.name}`);
        return;
      }

      // Create a new source node
      const newSourceNode = audioContext.createBufferSource();
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
      const { gains, listeningSource } = config;

      // Don't set if we were the ones dragging the listening source
      if (!state.isDraggingListeningSource) {
        set({ listeningSourcePosition: listeningSource });
      }

      // Extract out what this client's gain is:
      const userId = useRoomStore.getState().userId;
      const user = gains[userId];
      const { gain, rampTime } = user;

      // Process
      const { audioContext, gainNode } = getAudioPlayer(state);

      const now = audioContext.currentTime;
      const currentGain = gainNode.gain.value;

      // Reset
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(currentGain, now);

      // Ramp time is set server side
      gainNode.gain.linearRampToValueAtTime(gain, now + rampTime);
    },

    pauseAudio: (data: { when: number }) => {
      const state = get();
      
      // Check if we're actually playing before trying to pause
      if (!state.isPlaying) {
        console.log("pauseAudio called but not currently playing, ignoring");
        return;
      }
      
      try {
        const { sourceNode, audioContext } = getAudioPlayer(state);
        const stopTime = audioContext.currentTime + data.when;
        
        // Only stop if the source node exists and hasn't been stopped already
        if (sourceNode && sourceNode.buffer) {
          sourceNode.stop(stopTime);
        }

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
      } catch (error) {
        console.warn("Error in pauseAudio:", error);
        // Still update the playing state even if stopping the audio failed
        set((state) => ({
          ...state,
          isPlaying: false,
        }));
      }
    },

    setListeningSourcePosition: (position: PositionType) => {
      set({ listeningSourcePosition: position });
    },

    setIsDraggingListeningSource: (isDragging) => {
      set({ isDraggingListeningSource: isDragging });
    },

    setConnectedClients: (clients) => {
      const state = get();
      const previousClients = state.connectedClients;
      
      // Find new clients by comparing with previous state
      const newClients = clients.filter(client => 
        !previousClients.some(prevClient => prevClient.clientId === client.clientId)
      );
      
      // Find clients who left by comparing with current state
      const leftClients = previousClients.filter(prevClient => 
        !clients.some(client => client.clientId === prevClient.clientId)
      );
      
      // Show toast notification for each new client (excluding the first load)
      if (previousClients.length > 0) {
        newClients.forEach(client => {
          toast.success(`${client.username || 'Someone'} joined the room! 🎵`, {
            description: `${clients.length} ${clients.length === 1 ? 'person' : 'people'} in the room`,
            duration: 4000,
          });
        });
        
        // Show notification for users who left
        leftClients.forEach(client => {
          toast.info(`${client.username || 'Someone'} left the room`, {
            description: `${clients.length} ${clients.length === 1 ? 'person' : 'people'} remaining`,
            duration: 3000,
          });
        });
      }
      
      set({ connectedClients: clients });
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

      const nextAudioId = audioSources[nextIndex].url;
      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.setSelectedAudioUrl(nextAudioId);

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
      const prevAudioId = audioSources[prevIndex].url;

      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.setSelectedAudioUrl(prevAudioId);

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

    // YouTube methods
    addYouTubeSource: async (source: Omit<YouTubeSource, 'addedAt' | 'addedBy'>) => {
      // Broadcast to server for synchronization across clients
      const state = get();
      state.broadcastAddYouTubeSource(source);
    },

    setYouTubeSources: (sources: YouTubeSource[]) => 
      set({ youtubeSources: sources }),

    setSelectedYouTubeId: (videoId: string) => 
      set({ selectedYouTubeId: videoId }),

    setYouTubePlayerReady: (isReady: boolean) => 
      set({ isYouTubePlayerReady: isReady }),

    setYouTubePlayer: (player: YouTubeEvent['target'] | null) => 
      set({ youtubePlayer: player }),

    broadcastPlayYouTube: (timeSeconds: number = 0) => {
      const state = get();
      const { socket } = getSocket(state);

      if (!state.selectedYouTubeId) {
        console.error("Cannot broadcast YouTube play: No video selected");
        return;
      }

      // Don't update isPlaying here - let the YouTube player state change handler manage it
      // This prevents conflicts between local control and WebSocket sync

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PLAY_YOUTUBE,
          videoId: state.selectedYouTubeId,
          timeSeconds,
        },
      });
    },

    broadcastPauseYouTube: () => {
      const state = get();
      const { socket } = getSocket(state);

      if (!state.selectedYouTubeId) {
        console.error("Cannot broadcast YouTube pause: No video selected");
        return;
      }

      // Don't update isPlaying here - let the YouTube player state change handler manage it
      // This prevents conflicts between local control and WebSocket sync

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PAUSE_YOUTUBE,
          videoId: state.selectedYouTubeId,
        },
      });
    },

    broadcastSeekYouTube: (timeSeconds: number) => {
      const state = get();
      const { socket } = getSocket(state);

      if (!state.selectedYouTubeId) {
        console.error("Cannot broadcast YouTube seek: No video selected");
        return;
      }

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SEEK_YOUTUBE,
          videoId: state.selectedYouTubeId,
          timeSeconds,
        },
      });
    },

    schedulePlayYouTube: (data: {
      videoId: string;
      timeSeconds: number;
      targetServerTime: number;
    }) => {
      const state = get();
      const { youtubePlayer } = state;

      if (!youtubePlayer || !state.isYouTubePlayerReady) {
        console.error("YouTube player not ready");
        return;
      }

      const waitTimeMs = calculateWaitTimeMilliseconds(
        data.targetServerTime,
        state.offsetEstimate
      );

      console.log(`YouTube sync play: waiting ${waitTimeMs}ms, seeking to ${data.timeSeconds}s`);

      // Update isPlaying state immediately for UI sync
      set({ isPlaying: true });

      setTimeout(() => {
        if (data.timeSeconds > 0) {
          youtubePlayer.seekTo(data.timeSeconds, true);
        }
        youtubePlayer.playVideo();
      }, Math.max(0, waitTimeMs));
    },

    schedulePauseYouTube: (data: {
      videoId: string;
      targetServerTime: number;
    }) => {
      const state = get();
      const { youtubePlayer } = state;

      if (!youtubePlayer || !state.isYouTubePlayerReady) {
        console.error("YouTube player not ready");
        return;
      }

      const waitTimeMs = calculateWaitTimeMilliseconds(
        data.targetServerTime,
        state.offsetEstimate
      );

      console.log(`YouTube sync pause: waiting ${waitTimeMs}ms`);

      // Update isPlaying state immediately for UI sync
      set({ isPlaying: false });

      setTimeout(() => {
        youtubePlayer.pauseVideo();
      }, Math.max(0, waitTimeMs));
    },

    scheduleSeekYouTube: (data: {
      videoId: string;
      timeSeconds: number;
      targetServerTime: number;
    }) => {
      const state = get();
      const { youtubePlayer } = state;

      if (!youtubePlayer || !state.isYouTubePlayerReady) {
        console.error("YouTube player not ready");
        return;
      }

      const waitTimeMs = calculateWaitTimeMilliseconds(
        data.targetServerTime,
        state.offsetEstimate
      );

      console.log(`YouTube sync seek: waiting ${waitTimeMs}ms, seeking to ${data.timeSeconds}s`);

      setTimeout(() => {
        youtubePlayer.seekTo(data.timeSeconds, true);
      }, Math.max(0, waitTimeMs));
    },

    // UI Mode methods
    setCurrentMode: (mode: 'library' | 'youtube') => {
      set({ currentMode: mode });
      // Broadcast mode change to sync across clients
      const state = get();
      state.broadcastModeChange(mode);
    },

    broadcastModeChange: (mode: 'library' | 'youtube') => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.SET_MODE,
          mode,
        },
      });
    },

    broadcastAddYouTubeSource: (source: Omit<YouTubeSource, 'addedAt' | 'addedBy'>) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.ADD_YOUTUBE_SOURCE,
          videoId: source.videoId,
          title: source.title,
          thumbnail: source.thumbnail,
          duration: source.duration ? parseFloat(source.duration) : null,
          channel: source.channel,
        },
      });
    },

    removeYouTubeSource: (videoId: string) => {
      const state = get();
      const { socket } = getSocket(state);

      // Send removal request to server
      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE,
          videoId,
        },
      });
    },

    // Reset function to clean up state
    // Player controls
    setIsShuffled: (shuffled: boolean) => {
      set({ isShuffled: shuffled });
    },

    setRepeatMode: (mode: 'none' | 'all' | 'one') => {
      set({ repeatMode: mode });
    },

    playNextYouTubeVideo: () => {
      const state = get();
      const { youtubeSources, selectedYouTubeId, isShuffled, repeatMode } = state;
      
      if (youtubeSources.length === 0) return;
      
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      let nextIndex = 0;
      
      if (isShuffled) {
        // Shuffle mode: play random video
        nextIndex = Math.floor(Math.random() * youtubeSources.length);
      } else {
        // Normal mode: play next in sequence
        nextIndex = currentIndex + 1;
        if (nextIndex >= youtubeSources.length) {
          if (repeatMode === 'all') {
            nextIndex = 0; // Loop back to beginning
          } else if (repeatMode === 'one') {
            // For repeat one, replay the current video from the beginning
            if (state.isYouTubePlayerReady && state.youtubePlayer) {
              state.broadcastPlayYouTube(0);
            }
            return; // Don't change the selected video
          } else {
            // No repeat mode - stop playing
            set({ isPlaying: false });
            return; // Stop playing if no repeat
          }
        }
      }
      
      const nextVideo = youtubeSources[nextIndex];
      if (nextVideo) {
        set({ selectedYouTubeId: nextVideo.videoId });
        // Auto-play the next video
        if (state.isYouTubePlayerReady && state.youtubePlayer) {
          state.broadcastPlayYouTube(0);
        }
      }
    },

    playPreviousYouTubeVideo: () => {
      const state = get();
      const { youtubeSources, selectedYouTubeId, isShuffled } = state;
      
      if (youtubeSources.length === 0) return;
      
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      let prevIndex = 0;
      
      if (isShuffled) {
        // Shuffle mode: play random video (different from current)
        do {
          prevIndex = Math.floor(Math.random() * youtubeSources.length);
        } while (prevIndex === currentIndex && youtubeSources.length > 1);
      } else {
        // Normal mode: play previous in sequence
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
          prevIndex = youtubeSources.length - 1; // Loop to end
        }
      }
      
      const prevVideo = youtubeSources[prevIndex];
      if (prevVideo) {
        set({ selectedYouTubeId: prevVideo.videoId });
        // Auto-play the previous video
        if (state.isYouTubePlayerReady && state.youtubePlayer) {
          state.broadcastPlayYouTube(0);
        }
      }
    },

    skipToNextYouTubeVideo: () => {
      const state = get();
      const { youtubeSources, selectedYouTubeId, isShuffled, isPlaying } = state;
      
      if (youtubeSources.length === 0) return;
      
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      let nextIndex = 0;
      
      if (isShuffled) {
        // Shuffle mode: play random video (different from current)
        do {
          nextIndex = Math.floor(Math.random() * youtubeSources.length);
        } while (nextIndex === currentIndex && youtubeSources.length > 1);
      } else {
        // Normal mode: play next in sequence
        nextIndex = (currentIndex + 1) % youtubeSources.length;
      }
      
      const nextVideo = youtubeSources[nextIndex];
      if (nextVideo) {
        set({ selectedYouTubeId: nextVideo.videoId });
        
        // If we were playing, start playing the new video
        if (isPlaying) {
          state.broadcastPlayYouTube(0);
        }
      }
    },

    skipToPreviousYouTubeVideo: () => {
      const state = get();
      const { youtubeSources, selectedYouTubeId, isShuffled, isPlaying } = state;
      
      if (youtubeSources.length === 0) return;
      
      const currentIndex = youtubeSources.findIndex(source => source.videoId === selectedYouTubeId);
      let prevIndex = 0;
      
      if (isShuffled) {
        // Shuffle mode: play random video (different from current)
        do {
          prevIndex = Math.floor(Math.random() * youtubeSources.length);
        } while (prevIndex === currentIndex && youtubeSources.length > 1);
      } else {
        // Normal mode: play previous in sequence
        prevIndex = (currentIndex - 1 + youtubeSources.length) % youtubeSources.length;
      }
      
      const prevVideo = youtubeSources[prevIndex];
      if (prevVideo) {
        set({ selectedYouTubeId: prevVideo.videoId });
        
        // If we were playing, start playing the new video
        if (isPlaying) {
          state.broadcastPlayYouTube(0);
        }
      }
    },

    resetStore: () => {
      const state = get();

      // Preserve the audio cache before reset
      const preservedAudioCache = state.audioCache;

      // Stop any playing audio
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch {
          // Ignore errors if already stopped
        }
      }

      // Close the websocket connection if it exists
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.close();
      }

      // Close the old audio context if it exists
      if (state.audioPlayer?.audioContext) {
        state.audioPlayer.audioContext.close().catch(() => {});
      }

      // Clear loading states to prevent memory leaks
      loadingStates.clear();

      // Reset state to initial values but preserve cache
      set({
        ...initialState,
        audioCache: preservedAudioCache,
        isAudioSystemReady: false, // Mark audio system as not ready during reset
      });

      // Reinitialize audio from scratch
      initializeAudio();
    },

    setVolume: (volume: number) => {
      const state = get();
      if (state.audioPlayer?.gainNode) {
        // Convert volume from 0-100 to 0-1 range
        const gainValue = volume / 100;
        state.audioPlayer.gainNode.gain.value = gainValue;
        console.log("Volume set to:", volume, "gain:", gainValue);
      }
      // Update the volume state
      set({ volume: volume / 100 }); // Store as 0-1 range
    },

    getVolume: () => {
      const state = get();
      // Return volume as 0-100 range
      return state.volume * 100;
    },

    // Audio system state management
    setIsAudioSystemReady: (ready: boolean) => {
      set({ isAudioSystemReady: ready });
      
      // If audio system is ready and we have pending sync data, apply it
      if (ready) {
        const state = get();
        if (state.pendingPlaybackSync) {
          try {
            if (state.pendingPlaybackSync.isPlaying) {
              // Use the existing playAudio method to sync playback
              state.playAudio({
                offset: state.pendingPlaybackSync.currentTime,
                when: 0, // Start immediately
              });
            } else {
              // For paused state, just set the position in the global state
              set({ currentTime: state.pendingPlaybackSync.currentTime });
            }
            // Clear pending sync after applying
            set({ pendingPlaybackSync: null, isPlaying: state.pendingPlaybackSync.isPlaying });
          } catch (error) {
            console.warn("Failed to apply pending playback sync:", error);
          }
        }
      }
    },

    setPendingPlaybackSync: (syncData: { isPlaying: boolean; currentTime: number } | null) => {
      set({ pendingPlaybackSync: syncData });
    },

    setPendingRoomState: (roomState: {
      selectedAudioId?: string;
      selectedYouTubeId?: string;
      mode?: string;
      playbackSync?: {
        isPlaying: boolean;
        currentTime: number;
        lastUpdated: number;
      };
    } | null) => {
      set({ pendingRoomState: roomState });
    },

    applyPendingRoomState: () => {
      const state = get();
      if (!state.pendingRoomState) return;

      console.log("Applying pending room state:", state.pendingRoomState);

      // Apply mode change
      if (state.pendingRoomState.mode) {
        set({ currentMode: state.pendingRoomState.mode as 'library' | 'youtube' });
      }

      // Apply audio selection with improved matching
      if (state.pendingRoomState.selectedAudioId) {
        const audioId = state.pendingRoomState.selectedAudioId;
        let audioSource = state.audioSources.find(source => source.id === audioId);
        
        if (!audioSource) {
          audioSource = state.audioSources.find(source => source.url === audioId);
        }
        
        if (!audioSource) {
          const incomingFilename = audioId.split('/').pop();
          audioSource = state.audioSources.find(source => {
            const sourceFilename = source.url.split('/').pop();
            return sourceFilename === incomingFilename;
          });
        }

        if (audioSource) {
          set({ 
            selectedAudioId: audioId,
            selectedAudioUrl: audioSource.url
          });
          console.log(`Applied pending audio selection: ${audioId} -> ${audioSource.url}`);
        }
      }

      // Apply YouTube selection
      if (state.pendingRoomState.selectedYouTubeId) {
        // This would need to be handled by the room store or passed to YouTube handling
        console.log("Pending YouTube selection:", state.pendingRoomState.selectedYouTubeId);
      }

      // Apply playback sync
      if (state.pendingRoomState.playbackSync) {
        const { isPlaying, currentTime, lastUpdated } = state.pendingRoomState.playbackSync;
        const now = Date.now();
        const timeElapsed = (now - lastUpdated) / 1000;
        const calculatedPosition = isPlaying ? currentTime + timeElapsed : currentTime;

        set({ 
          isPlaying,
          currentTime: calculatedPosition 
        });

        if (isPlaying && state.isAudioSystemReady && state.audioPlayer) {
          // Try to start playback at the calculated position
          try {
            state.playAudio({
              offset: calculatedPosition,
              when: 0,
            });
          } catch (error) {
            console.warn("Failed to start playback from pending state:", error);
          }
        }
      }

      // Clear pending state
      set({ pendingRoomState: null });
    },
  };
});
