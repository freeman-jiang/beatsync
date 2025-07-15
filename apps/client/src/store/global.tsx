/* eslint-disable @typescript-eslint/no-unused-vars */
import { LocalAudioSource, RawAudioSource, YouTubeSource } from "@/lib/localTypes";
import {
  NTPMeasurement,
  _sendNTPRequest,
  calculateOffsetEstimate,
  calculateWaitTimeMilliseconds,
} from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  ClientActionEnum,
  ClientType,
  GRID,
  PositionType,
  SpatialConfigType,
} from "@beatsync/shared";
import { toast } from "sonner";
import { create } from "zustand";
import { useRoomStore } from "./room";
import { extractDefaultFileName } from "@/lib/utils";
import { fetchDefaultAudioSources } from "@/lib/api";
import type { YouTubeEvent } from "react-youtube";

export const MAX_NTP_MEASUREMENTS = 40;

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
  audioSources: LocalAudioSource[];
  isInitingSystem: boolean;
  selectedAudioId: string;
  uploadHistory: { name: string; timestamp: number; id: string }[];
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
}

interface GlobalState extends GlobalStateValues {
  // Methods
  setIsInitingSystem: (isIniting: boolean) => void;
  addToUploadHistory: (name: string, id: string) => void;
  reuploadAudio: (audioId: string, audioName: string) => void;
  reorderClient: (clientId: string) => void;
  hasDownloadedAudio: (id: string) => boolean;
  markAudioAsDownloaded: (id: string) => void;
  setAudioSources: (sources: LocalAudioSource[]) => void;
  addAudioSource: (source: RawAudioSource) => Promise<void>;
  setSelectedAudioId: (audioId: string) => boolean;
  findAudioIndexById: (audioId: string) => number | null;
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
}

// Define initial state values
const initialState: GlobalStateValues = {
  // Audio playback state
  isPlaying: false,
  currentTime: 0,
  playbackStartTime: 0,
  playbackOffset: 0,
  selectedAudioId: "",

  // Spatial audio
  isShuffled: false,
  repeatMode: 'none' as const,
  isSpatialAudioEnabled: false,
  isDraggingListeningSource: false,
  listeningSourcePosition: { x: GRID.SIZE / 2, y: GRID.SIZE / 2 },
  spatialConfig: undefined,

  // Network state
  socket: null,
  connectedClients: [],
  uploadHistory: [],
  downloadedAudioIds: new Set<string>(),

  // NTP state
  ntpMeasurements: [],
  offsetEstimate: 0,
  roundTripEstimate: 0,
  isSynced: false,

  // Loading state
  isInitingSystem: true,

  // These need to be initialized to prevent type errors
  audioSources: [],
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
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return {
    name: extractDefaultFileName(url),
    audioBuffer,
    id: url,
  };
};

// Web audio API
const initializeAudioContext = () => {
  const audioContext = new AudioContext();
  return audioContext;
};

export const useGlobalStore = create<GlobalState>((set, get) => {
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
    });

    console.log("Audio system initialized without default sources");
  };

  // Function to load default audio files from the server
  const loadDefaultAudio = async () => {
    try {
      console.log("Loading default audio files...");
      const defaultAudioList = await fetchDefaultAudioSources();
      console.log("Default audio list received:", defaultAudioList);
      
      const state = get();
      let audioContext = state.audioPlayer?.audioContext;
      
      // Create audio context if it doesn't exist
      if (!audioContext) {
        audioContext = new AudioContext();
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

      // Load each default audio file
      for (const audioFile of defaultAudioList) {
        try {
          console.log("Attempting to load audio file:", audioFile.url);
          const audioSource = await loadAudioSourceUrl({
            url: audioFile.url,
            audioContext,
          });
          
          // Mark as downloaded and add to audio sources
          state.markAudioAsDownloaded(audioSource.id);
          
          set((state) => {
            const isFirstAudio = state.audioSources.length === 0;
            return {
              audioSources: [...state.audioSources, audioSource],
              // Auto-select the first audio file loaded
              ...(isFirstAudio ? { 
                selectedAudioId: audioSource.id,
                duration: audioSource.audioBuffer?.duration || 0 
              } : {}),
            };
          });
          
          console.log(`Loaded default audio: ${audioSource.name}`);
        } catch (error) {
          console.error(`Failed to load default audio file ${audioFile.url}:`, error);
        }
      }
      
      console.log("Default audio files loaded");
    } catch (error) {
      console.error("Failed to load default audio files:", error);
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
    addToUploadHistory: (name, id) =>
      set((state) => ({
        uploadHistory: [
          ...state.uploadHistory,
          { name, timestamp: Date.now(), id },
        ],
      })),

    reuploadAudio: (audioId, audioName) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.REUPLOAD_AUDIO,
          audioId,
          audioName,
        },
      });
    },

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

    setAudioSources: (sources) => set({ audioSources: sources }),

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
        state.addToUploadHistory(source.name, source.id);

        const newAudioSource = {
          name: source.name,
          audioBuffer,
          id: source.id,
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
        const audioContext = state.audioPlayer?.audioContext;
        // Modern browsers require user interaction before playing audio
        // If context is suspended, we need to resume it
        if (audioContext && audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("AudioContext resumed via user gesture");
          } catch (err) {
            console.warn("Failed to resume AudioContext", err);
          }
        }
      }

      // Update the initialization state
      set({ isInitingSystem: isIniting });
    },

    setSelectedAudioId: (audioId) => {
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
      const audioIndex = state.findAudioIndexById(audioId);
      let newDuration = 0;
      if (audioIndex !== null) {
        const audioSource = state.audioSources[audioIndex];
        if (audioSource?.audioBuffer) {
          newDuration = audioSource.audioBuffer.duration;
        }
      }

      // Reset timing state and update selected ID
      set({
        selectedAudioId: audioId,
        isPlaying: false, // Always stop playback on track change before potentially restarting
        currentTime: 0,
        playbackStartTime: 0,
        playbackOffset: 0,
        duration: newDuration,
      });

      // Return the previous playing state for the skip functions to use
      return wasPlaying;
    },

    findAudioIndexById: (audioId: string) => {
      const state = get();
      // Look through the audioSources for a matching ID
      const index = state.audioSources.findIndex(
        (source) => source.id === audioId
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
      if (data.audioId !== state.selectedAudioId) {
        set({ selectedAudioId: data.audioId });
      }

      // Find the index of the audio to play
      const audioIndex = state.findAudioIndexById(data.audioId);
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
      console.log(`Pausing track in ${waitTimeSeconds}`);

      state.pauseAudio({
        when: waitTimeSeconds,
      });
    },

    setSocket: (socket) => set({ socket }),

    broadcastPlay: (trackTimeSeconds?: number) => {
      const state = get();
      const { socket } = getSocket(state);

      // Make sure we have a selected audio ID
      if (!state.selectedAudioId) {
        console.error("Cannot broadcast play: No audio selected");
        return;
      }

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PLAY,
          trackTimeSeconds: trackTimeSeconds ?? state.getCurrentTrackPosition(),
          audioId: state.selectedAudioId,
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
      if (state.ntpMeasurements.length >= MAX_NTP_MEASUREMENTS) {
        const { averageOffset, averageRoundTrip } = calculateOffsetEstimate(
          state.ntpMeasurements
        );
        set({
          offsetEstimate: averageOffset,
          roundTripEstimate: averageRoundTrip,
          isSynced: true,
        });

        if (averageRoundTrip > 750) {
          toast.error("Latency is very high (>750ms). Sync may be unstable.");
        }

        return;
      }

      // Otherwise not done, keep sending
      const { socket } = getSocket(state);

      // Send the first one
      _sendNTPRequest(socket);
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
      set((state) => ({
        ntpMeasurements: [...state.ntpMeasurements, measurement],
      })),

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
      } catch (_) {}

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
      
      const audioBuffer = state.audioSources[audioIndex].audioBuffer;
      if (!audioBuffer) {
        console.error("Audio buffer not available");
        toast.error("Audio file not properly loaded");
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
        duration: audioBuffer.duration || 0, // Set the duration
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
      const { audioSources, selectedAudioId, isShuffled } = state;
      if (audioSources.length <= 1) return; // Can't skip if only one track

      const currentIndex = state.findAudioIndexById(selectedAudioId);
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

      const nextAudioId = audioSources[nextIndex].id;
      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.setSelectedAudioId(nextAudioId);

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
      const { audioSources, selectedAudioId /* isShuffled */ } = state; // Note: isShuffled is NOT used here currently
      if (audioSources.length === 0) return;

      const currentIndex = state.findAudioIndexById(selectedAudioId);
      if (currentIndex === null) return;

      // Previous track always goes to the actual previous in the list, even if shuffled
      // This is a common behavior, but could be changed if needed.
      const prevIndex =
        (currentIndex - 1 + audioSources.length) % audioSources.length;
      const prevAudioId = audioSources[prevIndex].id;

      // setSelectedAudioId stops any current playback and sets isPlaying to false.
      // It returns true if playback was active *before* this function was called.
      const wasPlayingBeforeSkip = state.setSelectedAudioId(prevAudioId);

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
      // Create a YouTube source object
      const youtubeSource: YouTubeSource = {
        ...source,
        addedAt: Date.now(),
        addedBy: useRoomStore.getState().userId || "anonymous",
      };

      // Add to local state
      set((state) => ({
        youtubeSources: [...state.youtubeSources, youtubeSource],
      }));

      // If no video is currently selected, select this one
      const state = get();
      if (!state.selectedYouTubeId) {
        set({ selectedYouTubeId: source.videoId });
      }
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
    setCurrentMode: (mode: 'library' | 'youtube') => 
      set({ currentMode: mode }),

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
      const { youtubeSources, selectedYouTubeId, isShuffled } = state;
      
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
      }
    },

    skipToPreviousYouTubeVideo: () => {
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
        prevIndex = (currentIndex - 1 + youtubeSources.length) % youtubeSources.length;
      }
      
      const prevVideo = youtubeSources[prevIndex];
      if (prevVideo) {
        set({ selectedYouTubeId: prevVideo.videoId });
      }
    },

    resetStore: () => {
      const state = get();

      // Stop any playing audio
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch (e) {
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

      // Reset state to initial values
      set(initialState);

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
  };
});
