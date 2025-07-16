"use client";
import { YouTubeSource } from "@/lib/localTypes";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";
import { NTPMeasurement } from "@/utils/ntp";
import {
  epochNow,
  NTPResponseMessageType,
  WSResponseSchema,
} from "@beatsync/shared";
import { useEffect } from "react";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";
import { toast } from "sonner";

// Helper function for NTP response handling
const handleNTPResponse = (response: NTPResponseMessageType) => {
  const t3 = epochNow();
  const { t0, t1, t2 } = response;

  // Calculate round-trip delay and clock offset
  // See: https://en.wikipedia.org/wiki/Network_Time_Protocol#Clock_synchronization_algorithm
  const clockOffset = (t1 - t0 + (t2 - t3)) / 2;
  const roundTripDelay = t3 - t0 - (t2 - t1);

  const measurement: NTPMeasurement = {
    t0,
    t1,
    t2,
    t3,
    roundTripDelay,
    clockOffset,
  };

  return measurement;
};

interface WebSocketManagerProps {
  roomId: string;
  username: string;
}

// No longer need the props interface
export const WebSocketManager = ({
  roomId,
  username,
}: WebSocketManagerProps) => {
  // Room state
  const isLoadingRoom = useRoomStore((state) => state.isLoadingRoom);
  const setUserId = useRoomStore((state) => state.setUserId);

  // WebSocket and audio state
  const setSocket = useGlobalStore((state) => state.setSocket);
  const socket = useGlobalStore((state) => state.socket);
  const schedulePlay = useGlobalStore((state) => state.schedulePlay);
  const schedulePause = useGlobalStore((state) => state.schedulePause);
  const processSpatialConfig = useGlobalStore(
    (state) => state.processSpatialConfig
  );
  const addNTPMeasurement = useGlobalStore((state) => state.addNTPMeasurement);
  const setConnectedClients = useGlobalStore(
    (state) => state.setConnectedClients
  );
  const isSpatialAudioEnabled = useGlobalStore(
    (state) => state.isSpatialAudioEnabled
  );
  const setIsSpatialAudioEnabled = useGlobalStore(
    (state) => state.setIsSpatialAudioEnabled
  );
  const processStopSpatialAudio = useGlobalStore(
    (state) => state.processStopSpatialAudio
  );
  // YouTube scheduling methods
  const schedulePlayYouTube = useGlobalStore((state) => state.schedulePlayYouTube);
  const schedulePauseYouTube = useGlobalStore((state) => state.schedulePauseYouTube);
  const scheduleSeekYouTube = useGlobalStore((state) => state.scheduleSeekYouTube);
  const setYouTubeSources = useGlobalStore((state) => state.setYouTubeSources);
  const setSelectedYouTubeId = useGlobalStore((state) => state.setSelectedYouTubeId);

  // Use the NTP heartbeat hook
  const { startHeartbeat, stopHeartbeat, markNTPResponseReceived } =
    useNtpHeartbeat({
      onConnectionStale: () => {
        const currentSocket = useGlobalStore.getState().socket;
        if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.close();
        }
      },
    });

  // Use the WebSocket reconnection hook
  const {
    onConnectionOpen,
    scheduleReconnection,
    cleanup: cleanupReconnection,
  } = useWebSocketReconnection({
    createConnection: () => createConnection(),
  });

  const createConnection = () => {
    const SOCKET_URL = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&username=${username}`;
    console.log("Creating new WS connection to", SOCKET_URL);

    // Clear previous connection if it exists
    if (socket) {
      console.log("Clearing previous connection");
      socket.onclose = () => {};
      socket.onerror = () => {};
      socket.onmessage = () => {};
      socket.onopen = () => {};
      socket.close();
    }

    const ws = new WebSocket(SOCKET_URL);
    setSocket(ws);

    ws.onopen = () => {
      console.log("Websocket onopen fired.");

      // Reset reconnection state
      onConnectionOpen();

      // Start NTP heartbeat
      startHeartbeat();
    };

    // This onclose event will only fire on unwanted websocket disconnects:
    // - Network chnage
    // - Server restart
    // So we should try to reconnect.
    ws.onclose = () => {
      // Stop NTP heartbeat
      stopHeartbeat();

      // Clear NTP measurements on new connection to avoid stale data
      useGlobalStore.getState().onConnectionReset();

      // Schedule reconnection with exponential backoff
      scheduleReconnection();
    };

    ws.onmessage = async (msg) => {
      // Update last message received time for connection health
      useGlobalStore.setState({ lastMessageReceivedTime: Date.now() });

      const response = WSResponseSchema.parse(JSON.parse(msg.data));

      if (response.type === "NTP_RESPONSE") {
        const ntpMeasurement = handleNTPResponse(response);
        addNTPMeasurement(ntpMeasurement);

        // Mark that we received the NTP response
        markNTPResponseReceived();
      } else if (response.type === "ROOM_EVENT") {
        const { event } = response;
        console.log("Room event:", event);

        if (event.type === "CLIENT_CHANGE") {
          setConnectedClients(event.clients);
        } else if (event.type === "SET_AUDIO_SOURCES") {
          console.log("Received SET_AUDIO_SOURCES:", event);
          // Handle setting audio sources
          // Note: This should be updated to properly map AudioSourceType to LocalAudioSource
          console.log("Audio sources sync from server");
        } else if (event.type === "NEW_AUDIO_SOURCE") {
          console.log("Received new audio source:", event);
          // Handle new audio source event
          const { id, title } = event;
          // You may want to add this to audio sources or handle it differently
          console.log(`New audio source: ${title} (${id})`);
        } else if (event.type === "NEW_YOUTUBE_SOURCE") {
          console.log("Received new YouTube source:", event);
          const { videoId, title, addedAt, addedBy, thumbnail } = event;

          // Get current state to avoid stale closure
          const currentState = useGlobalStore.getState();
          const currentYouTubeSources = currentState.youtubeSources;
          const currentSelectedYouTubeId = currentState.selectedYouTubeId;

          // Add the YouTube source to the store
          const youtubeSource: YouTubeSource = {
            videoId,
            title,
            thumbnail,
            addedAt,
            addedBy,
          };

          const newSources = [...currentYouTubeSources, youtubeSource];
          setYouTubeSources(newSources);

          // Auto-select this video if no video is currently selected
          if (!currentSelectedYouTubeId) {
            setSelectedYouTubeId(videoId);
          }

          toast.success(`YouTube video added: ${title}`);
        } else if (event.type === "REMOVE_YOUTUBE_SOURCE") {
          console.log("Received REMOVE_YOUTUBE_SOURCE:", event);
          const { videoId } = event;

          // Get current state to avoid stale closure
          const currentState = useGlobalStore.getState();
          const currentYouTubeSources = currentState.youtubeSources;
          const currentSelectedYouTubeId = currentState.selectedYouTubeId;

          // Remove the YouTube source from the store
          const newSources = currentYouTubeSources.filter(source => source.videoId !== videoId);
          setYouTubeSources(newSources);

          // If we removed the currently selected video, clear selection
          if (videoId === currentSelectedYouTubeId) {
            setSelectedYouTubeId("");
          }

          // Find the video title for the toast (if it still exists in the current sources)
          const removedVideo = currentYouTubeSources.find(source => source.videoId === videoId);
          const videoTitle = removedVideo ? removedVideo.title : videoId;

          toast.success(`YouTube video removed: ${videoTitle}`);
        } else if (event.type === "SET_YOUTUBE_SOURCES") {
          console.log("Received SET_YOUTUBE_SOURCES:", event);
          // Convert duration from number to string to match local type
          const convertedSources = event.sources.map(source => ({
            ...source,
            duration: source.duration ? source.duration.toString() : undefined,
          }));
          setYouTubeSources(convertedSources);
        } else if (event.type === "MODE_CHANGE") {
          console.log("Received MODE_CHANGE:", event);
          // Update mode without triggering broadcast (to avoid loops)
          const currentState = useGlobalStore.getState();
          
          if (currentState.audioSources.length === 0) {
            console.log("Audio sources not loaded yet, storing mode change for later");
            const existingPending = currentState.pendingRoomState || {};
            currentState.setPendingRoomState({
              ...existingPending,
              mode: event.mode
            });
          } else {
            useGlobalStore.setState({ currentMode: event.mode });
          }
        } else if (event.type === "SELECTED_AUDIO_CHANGE") {
          console.log("Received SELECTED_AUDIO_CHANGE:", event);
          // Update selected audio ID and find corresponding URL
          const currentState = useGlobalStore.getState();
          
          // If no audio sources are loaded yet, store this for later
          if (currentState.audioSources.length === 0) {
            console.log("Audio sources not loaded yet, storing selection for later");
            const existingPending = currentState.pendingRoomState || {};
            currentState.setPendingRoomState({
              ...existingPending,
              selectedAudioId: event.audioId
            });
            return;
          }
          
          // Try to find audio source by exact ID match first
          let audioSource = currentState.audioSources.find(source => source.id === event.audioId);
          
          // If not found by ID, try to find by URL match
          if (!audioSource) {
            audioSource = currentState.audioSources.find(source => source.url === event.audioId);
          }
          
          // If still not found, try to match by filename (last part of URL)
          if (!audioSource) {
            const incomingFilename = event.audioId.split('/').pop();
            audioSource = currentState.audioSources.find(source => {
              const sourceFilename = source.url.split('/').pop();
              return sourceFilename === incomingFilename;
            });
          }
          
          if (audioSource) {
            // Update both selectedAudioId and selectedAudioUrl without triggering broadcast
            useGlobalStore.setState({ 
              selectedAudioId: event.audioId, // Use the server's ID format
              selectedAudioUrl: audioSource.url // Use the client's URL
            });
            console.log(`Successfully matched audio: ${event.audioId} -> ${audioSource.url}`);
          } else {
            console.warn("Audio source not found for ID:", event.audioId);
            console.log("Available audio sources:", currentState.audioSources.map(s => ({ id: s.id, url: s.url })));
          }
        } else if (event.type === "SELECTED_YOUTUBE_CHANGE") {
          console.log("Received SELECTED_YOUTUBE_CHANGE:", event);
          // Update selected YouTube ID without triggering broadcast
          setSelectedYouTubeId(event.videoId);
        } else if (event.type === "PLAYBACK_STATE") {
          console.log("Received PLAYBACK_STATE:", event);
          // Update the current playback state for new clients
          const currentState = useGlobalStore.getState();
          
          // If no audio sources are loaded yet, store this for later
          if (currentState.audioSources.length === 0) {
            console.log("Audio sources not loaded yet, storing playback state for later");
            const existingPending = currentState.pendingRoomState || {};
            currentState.setPendingRoomState({
              ...existingPending,
              selectedAudioId: event.selectedAudioId,
              playbackSync: {
                isPlaying: event.isPlaying,
                currentTime: event.currentTime,
                lastUpdated: event.lastUpdated
              }
            });
            return;
          }
          
          // Update selected tracks
          if (event.selectedAudioId) {
            // Try to find audio source with improved matching logic
            let audioSource = currentState.audioSources.find(source => source.id === event.selectedAudioId);
            
            // If not found by ID, try to find by URL match
            if (!audioSource) {
              audioSource = currentState.audioSources.find(source => source.url === event.selectedAudioId);
            }
            
            // If still not found, try to match by filename (last part of URL)
            if (!audioSource) {
              const incomingFilename = event.selectedAudioId.split('/').pop();
              audioSource = currentState.audioSources.find(source => {
                const sourceFilename = source.url.split('/').pop();
                return sourceFilename === incomingFilename;
              });
            }
            
            if (audioSource) {
              useGlobalStore.setState({ 
                selectedAudioId: event.selectedAudioId, // Use the server's ID format
                selectedAudioUrl: audioSource.url // Use the client's URL
              });
              console.log(`PLAYBACK_STATE: Successfully matched audio: ${event.selectedAudioId} -> ${audioSource.url}`);
            } else {
              console.warn("PLAYBACK_STATE: Audio source not found for ID:", event.selectedAudioId);
              console.log("Available audio sources:", currentState.audioSources.map(s => ({ id: s.id, url: s.url })));
            }
          }
          
          if (event.selectedYouTubeId) {
            setSelectedYouTubeId(event.selectedYouTubeId);
          }
          
          // Always sync playback state regardless of playing/paused status
          if (event.selectedAudioId || event.selectedYouTubeId) {
            const now = Date.now();
            const timeElapsedSinceUpdate = (now - event.lastUpdated) / 1000; // Convert to seconds
            
            // For playing tracks, calculate current position; for paused tracks, use exact time
            const currentPosition = event.isPlaying 
              ? event.currentTime + timeElapsedSinceUpdate 
              : event.currentTime;
            
            console.log(`Syncing playback state: ${event.isPlaying ? 'playing' : 'paused'} at ${currentPosition}s (elapsed: ${timeElapsedSinceUpdate}s)`);
            
            // Update playback state in store
            useGlobalStore.setState({ 
              isPlaying: event.isPlaying,
              currentTime: currentPosition 
            });
            
            // Ensure audio is loaded for the selected track
            if (event.selectedAudioId) {
              // Use the same improved matching logic to find the audio source
              let audioSource = currentState.audioSources.find(source => source.id === event.selectedAudioId);
              
              if (!audioSource) {
                audioSource = currentState.audioSources.find(source => source.url === event.selectedAudioId);
              }
              
              if (!audioSource) {
                const incomingFilename = event.selectedAudioId.split('/').pop();
                audioSource = currentState.audioSources.find(source => {
                  const sourceFilename = source.url.split('/').pop();
                  return sourceFilename === incomingFilename;
                });
              }
              
              if (audioSource) {
                const { getAudioDuration } = useGlobalStore.getState();
                getAudioDuration({ url: audioSource.url });
              }
            }
            
            // Only try to sync if audio system is initialized
            if (currentState.audioPlayer && currentState.isAudioSystemReady) {
              try {
                if (event.isPlaying && event.selectedAudioId) {
                  // Schedule play at the calculated position
                  schedulePlay({
                    trackTimeSeconds: currentPosition,
                    targetServerTime: now, // Play immediately
                    audioId: event.selectedAudioId,
                  });
                } else {
                  // For paused state, just update the current time in the global state
                  useGlobalStore.setState({ currentTime: currentPosition });
                }
              } catch (error) {
                console.warn("Could not sync playback - audio system may not be ready:", error);
                // Store the playback state for later sync when audio system is ready
                const { setPendingPlaybackSync } = useGlobalStore.getState();
                setPendingPlaybackSync({
                  isPlaying: event.isPlaying,
                  currentTime: currentPosition,
                });
              }
            } else {
              console.log("Audio system not ready, storing playback state for later sync");
              // Store the playback state for later sync when audio system is ready
              const { setPendingPlaybackSync } = useGlobalStore.getState();
              setPendingPlaybackSync({
                isPlaying: event.isPlaying,
                currentTime: currentPosition,
              });
            }
          }
        }
      } else if (response.type === "SCHEDULED_ACTION") {
        // handle scheduling action
        console.log("Received scheduled action:", response);
        const { scheduledAction, serverTimeToExecute } = response;

        if (scheduledAction.type === "PLAY") {
          schedulePlay({
            trackTimeSeconds: scheduledAction.trackTimeSeconds,
            targetServerTime: serverTimeToExecute,
            audioId: scheduledAction.audioId,
          });
        } else if (scheduledAction.type === "PAUSE") {
          schedulePause({
            targetServerTime: serverTimeToExecute,
          });
        } else if (scheduledAction.type === "SPATIAL_CONFIG") {
          processSpatialConfig(scheduledAction);
          if (!isSpatialAudioEnabled) {
            setIsSpatialAudioEnabled(true);
          }
        } else if (scheduledAction.type === "STOP_SPATIAL_AUDIO") {
          processStopSpatialAudio();
        } else if (scheduledAction.type === "PLAY_YOUTUBE") {
          schedulePlayYouTube({
            videoId: scheduledAction.videoId,
            timeSeconds: scheduledAction.timeSeconds,
            targetServerTime: serverTimeToExecute,
          });
        } else if (scheduledAction.type === "PAUSE_YOUTUBE") {
          schedulePauseYouTube({
            videoId: scheduledAction.videoId,
            targetServerTime: serverTimeToExecute,
          });
        } else if (scheduledAction.type === "SEEK_YOUTUBE") {
          scheduleSeekYouTube({
            videoId: scheduledAction.videoId,
            timeSeconds: scheduledAction.timeSeconds,
            targetServerTime: serverTimeToExecute,
          });
        }
      } else if (response.type === "SET_CLIENT_ID") {
        setUserId(response.clientId);
      } else {
        console.log("Unknown response type:", response);
      }
    };

    return ws;
  };

  // Once room has been loaded, connect to the websocket
  useEffect(() => {
    // Only run this effect once after room is loaded
    if (isLoadingRoom || !roomId || !username) return;
    console.log("Connecting to websocket");

    // Don't create a new connection if we already have one
    if (socket) {
      return;
    }

    const ws = createConnection();

    return () => {
      // Runs on unmount and dependency change
      console.log("Running cleanup for WebSocket connection");

      // Clean up reconnection state
      cleanupReconnection();

      // Clear the onclose handler to prevent reconnection attempts - this is an intentional close
      ws.onclose = () => {
        console.log("Websocket closed by cleanup");
      };

      // Stop NTP heartbeat
      stopHeartbeat();
      ws.close();
    };
    // Not including socket in the dependency array because it will trigger the close when it's set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingRoom, roomId, username]);

  return null; // This is a non-visual component
};
