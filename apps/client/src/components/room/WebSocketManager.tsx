"use client";
import { useClientId } from "@/hooks/useClientId";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";
import { getUserLocation } from "@/lib/ip";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { NTPMeasurement } from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  ClientActionEnum,
  epochNow,
  NTPResponseMessageType,
  WSResponseSchema,
} from "@beatsync/shared";
import { useEffect } from "react";

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
  const processGlobalVolumeConfig = useGlobalStore(
    (state) => state.processGlobalVolumeConfig
  );
  const handleSetAudioSources = useGlobalStore(
    (state) => state.handleSetAudioSources
  );
  const setPlaybackControlsPermissions = useGlobalStore(
    (state) => state.setPlaybackControlsPermissions
  );
  const setActiveStreamJobs = useGlobalStore(
    (state) => state.setActiveStreamJobs
  );
  const setMessages = useChatStore((state) => state.setMessages);
  const handleLoadAudioSource = useGlobalStore(
    (state) => state.handleLoadAudioSource
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

    ws.onopen = async () => {
      console.log("Websocket onopen fired.");

      // Reset reconnection state
      onConnectionOpen();

      // Start NTP heartbeat
      startHeartbeat();

      try {
        const location = await getUserLocation();

        // IP Sync
        sendWSRequest({
          ws,
          request: {
            type: ClientActionEnum.enum.SEND_IP,
            location,
          },
        });
      } catch (e) {
        console.error("Failed to geolocate IP", e);
      }
    };

    // This onclose event will only fire on unwanted websocket disconnects:
    // - Network chnage
    // - Server restart
    // So we should try to reconnect.
    ws.onclose = () => {
      console.log("Websocket closed unexpectedly");
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
          setConnectedClients(event.clients);
        } else if (event.type === "SET_AUDIO_SOURCES") {
          handleSetAudioSources(event);
        } else if (event.type === "SET_PLAYBACK_CONTROLS") {
          setPlaybackControlsPermissions(event.permissions);
        } else if (event.type === "CHAT_UPDATE") {
          // Handle chat messages
          setMessages(event.messages, event.isFullSync, event.newestId);
        } else if (event.type === "LOAD_AUDIO_SOURCE") {
          handleLoadAudioSource(event);
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
        } else if (scheduledAction.type === "SPATIAL_CONFIG") {
          processSpatialConfig(scheduledAction);
          if (!isSpatialAudioEnabled) {
            setIsSpatialAudioEnabled(true);
          }
        } else if (scheduledAction.type === "STOP_SPATIAL_AUDIO") {
          processStopSpatialAudio();
        } else if (scheduledAction.type === "GLOBAL_VOLUME_CONFIG") {
          processGlobalVolumeConfig(scheduledAction);
        }
      } else if (response.type === "SEARCH_RESPONSE") {
        console.log("Received search response:", response);
        const {
          setSearchResults,
          setIsSearching,
          setIsLoadingMoreResults,
          setHasMoreResults,
          isLoadingMoreResults,
        } = useGlobalStore.getState();

        // Determine if this is pagination or new search
        const isAppending = isLoadingMoreResults;

        // Update search results (append if pagination, replace if new search)
        setSearchResults(response.response, isAppending);

        // Update loading states
        setIsSearching(false);
        setIsLoadingMoreResults(false);

        // Update hasMoreResults based on response
        if (response.response.type === "success") {
          const { total, items, offset } =
            response.response.response.data.tracks;
          const hasMore = offset + items.length < total;
          setHasMoreResults(hasMore);
        } else {
          setHasMoreResults(false);
        }
      } else if (response.type === "STREAM_JOB_UPDATE") {
        console.log("Received stream job update:", response.activeJobCount);
        setActiveStreamJobs(response.activeJobCount);
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
