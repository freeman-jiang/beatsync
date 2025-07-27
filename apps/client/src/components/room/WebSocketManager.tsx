"use client";
import { useClientId } from "@/hooks/useClientId";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { NTPMeasurement } from "@/utils/ntp";
import {
  epochNow,
  NTPResponseMessageType,
  WSResponseSchema,
  ClientType,
} from "@beatsync/shared";
import { useEffect, useRef } from "react";
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
  // Track previous clients to detect new connections
  const previousClientsRef = useRef<ClientType[]>([]);
  
  // Get PostHog client ID
  const { clientId } = useClientId();

  // Room state
  const isLoadingRoom = useRoomStore((state) => state.isLoadingRoom);

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
  const handleSetAudioSources = useGlobalStore(
    (state) => state.handleSetAudioSources
  );

  // YouTube-related state and actions
  const handleSetYouTubeSources = useGlobalStore(
    (state) => state.handleSetYouTubeSources
  );
  const setCurrentModeLocal = useGlobalStore((state) => state.setCurrentModeLocal);
  const setSelectedAudioUrl = useGlobalStore((state) => state.setSelectedAudioUrl);
  const setSelectedYouTubeId = useGlobalStore((state) => state.setSelectedYouTubeId);
  const schedulePlayYouTube = useGlobalStore((state) => state.schedulePlayYouTube);
  const schedulePauseYouTube = useGlobalStore((state) => state.schedulePauseYouTube);
  const scheduleSeekYouTube = useGlobalStore((state) => state.scheduleSeekYouTube);
  const setPlaybackControlsPermissions = useGlobalStore(
    (state) => state.setPlaybackControlsPermissions
  );

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

  // Function to handle client changes and show toast for new users
  const handleClientChange = (newClients: ClientType[]) => {
    const previousClients = previousClientsRef.current;
    
    // Only show notifications if we have previous clients (not on initial load)
    if (previousClients.length > 0) {
      // Find new clients by comparing client IDs
      const previousClientIds = new Set(previousClients.map(client => client.clientId));
      const newUsers = newClients.filter(client => 
        !previousClientIds.has(client.clientId) && client.clientId !== clientId
      );
      
      // Show toast for each new user
      newUsers.forEach(newUser => {
        toast.success(`${newUser.username} joined the room! 🎵`, {
          duration: 3000,
          position: "top-right",
        });
      });
    }
    
    // Update the previous clients reference
    previousClientsRef.current = newClients;
    
    // Update the global state
    setConnectedClients(newClients);
  };

  const createConnection = () => {
    const SOCKET_URL = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&username=${username}&clientId=${clientId}`;
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

    // TODO: Refactor into exhaustive handler registry
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
          handleClientChange(event.clients);
        } else if (event.type === "SET_AUDIO_SOURCES") {
          handleSetAudioSources({ sources: event.sources });
        } else if (event.type === "SET_YOUTUBE_SOURCES") {
          handleSetYouTubeSources({ sources: event.sources });
        } else if (event.type === "SET_CURRENT_MODE") {
          setCurrentModeLocal(event.mode);
        } else if (event.type === "SET_SELECTED_AUDIO") {
          setSelectedAudioUrl(event.audioUrl);
        } else if (event.type === "SET_SELECTED_YOUTUBE") {
          setSelectedYouTubeId(event.videoId);
        } else if (event.type === "SET_PLAYBACK_CONTROLS") {
          setPlaybackControlsPermissions(event.permissions);
        }
      } else if (response.type === "SCHEDULED_ACTION") {
        // handle scheduling action
        console.log("Received scheduled action:", response);
        const { scheduledAction, serverTimeToExecute } = response;

        if (scheduledAction.type === "PLAY") {
          schedulePlay({
            trackTimeSeconds: scheduledAction.trackTimeSeconds,
            targetServerTime: serverTimeToExecute,
            audioSource: scheduledAction.audioSource,
          });
        } else if (scheduledAction.type === "PAUSE") {
          schedulePause({
            targetServerTime: serverTimeToExecute,
          });
        } else if (scheduledAction.type === "PLAY_YOUTUBE") {
          schedulePlayYouTube({
            trackTimeSeconds: scheduledAction.trackTimeSeconds,
            targetServerTime: serverTimeToExecute,
            videoId: scheduledAction.videoId,
          });
        } else if (scheduledAction.type === "PAUSE_YOUTUBE") {
          schedulePauseYouTube({
            targetServerTime: serverTimeToExecute,
          });
        } else if (scheduledAction.type === "SEEK_YOUTUBE") {
          scheduleSeekYouTube({
            trackTimeSeconds: scheduledAction.trackTimeSeconds,
            targetServerTime: serverTimeToExecute,
            videoId: scheduledAction.videoId,
          });
        } else if (scheduledAction.type === "SPATIAL_CONFIG") {
          processSpatialConfig(scheduledAction);
          if (!isSpatialAudioEnabled) {
            setIsSpatialAudioEnabled(true);
          }
        } else if (scheduledAction.type === "STOP_SPATIAL_AUDIO") {
          processStopSpatialAudio();
        }
      } else {
        console.log("Unknown response type:", response);
      }
    };

    return ws;
  };

  // Once room has been loaded and we have clientId, connect to the websocket
  useEffect(() => {
    // Only run this effect once after room is loaded and clientId is available
    if (isLoadingRoom || !roomId || !username || !clientId) return;

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
  }, [isLoadingRoom, roomId, username, clientId]);

  return null; // This is a non-visual component
};
