"use client";

import { useEffect } from "react";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";
import { NTPMeasurement } from "@/utils/ntp";
import {
  epochNow,
  NTPResponseMessageType,
  WSResponseSchema,
} from "@beatsync/shared";

interface WebSocketManagerProps {
  roomId: string;
  username: string;
}

// Helper to process NTP sync
const handleNTPResponse = (response: NTPResponseMessageType): NTPMeasurement => {
  const t3 = epochNow();
  const { t0, t1, t2 } = response;

  const clockOffset = (t1 - t0 + (t2 - t3)) / 2;
  const roundTripDelay = t3 - t0 - (t2 - t1);

  return {
    t0,
    t1,
    t2,
    t3,
    roundTripDelay,
    clockOffset,
  };
};

export const WebSocketManager = ({ roomId, username }: WebSocketManagerProps) => {
  // Stores
  const isLoadingRoom = useRoomStore((s) => s.isLoadingRoom);
  const setUserId = useRoomStore((s) => s.setUserId);

  const socket = useGlobalStore((s) => s.socket);
  const setSocket = useGlobalStore((s) => s.setSocket);
  const schedulePlay = useGlobalStore((s) => s.schedulePlay);
  const schedulePause = useGlobalStore((s) => s.schedulePause);
  const addNTPMeasurement = useGlobalStore((s) => s.addNTPMeasurement);
  const setConnectedClients = useGlobalStore((s) => s.setConnectedClients);
  const processSpatialConfig = useGlobalStore((s) => s.processSpatialConfig);
  const processStopSpatialAudio = useGlobalStore((s) => s.processStopSpatialAudio);
  const handleSetAudioSources = useGlobalStore((s) => s.handleSetAudioSources);
  const isSpatialAudioEnabled = useGlobalStore((s) => s.isSpatialAudioEnabled);
  const setIsSpatialAudioEnabled = useGlobalStore((s) => s.setIsSpatialAudioEnabled);

  const {
    startHeartbeat,
    stopHeartbeat,
    markNTPResponseReceived,
  } = useNtpHeartbeat({
    onConnectionStale: () => {
      const currentSocket = useGlobalStore.getState().socket;
      if (currentSocket?.readyState === WebSocket.OPEN) {
        currentSocket.close();
      }
    },
  });

  const {
    onConnectionOpen,
    scheduleReconnection,
    cleanup: cleanupReconnection,
  } = useWebSocketReconnection({
    createConnection: () => createConnection(),
  });

  const createConnection = () => {
    const SOCKET_URL = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&username=${username}`;
    console.log("[WebSocket] Connecting to", SOCKET_URL);

    if (socket) {
      console.log("[WebSocket] Clearing previous connection");
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.close();
    }

    const ws = new WebSocket(SOCKET_URL);
    setSocket(ws);

    ws.onopen = () => {
      console.log("[WebSocket] Connected.");
      onConnectionOpen();
      startHeartbeat();
    };

    ws.onclose = () => {
      console.warn("[WebSocket] Closed. Scheduling reconnect...");
      stopHeartbeat();
      useGlobalStore.getState().onConnectionReset?.();
      scheduleReconnection();
    };

    ws.onmessage = (msg) => {
      useGlobalStore.setState({ lastMessageReceivedTime: Date.now() });

      const parsed = WSResponseSchema.safeParse(JSON.parse(msg.data));
      if (!parsed.success) {
        console.warn("Invalid WS message format", msg.data);
        return;
      }

      const response = parsed.data;

      switch (response.type) {
        case "NTP_RESPONSE": {
          const measurement = handleNTPResponse(response);
          addNTPMeasurement(measurement);
          markNTPResponseReceived();
          break;
        }

        case "ROOM_EVENT": {
          const { event } = response;
          if (event.type === "CLIENT_CHANGE") {
            setConnectedClients(event.clients);
          } else if (event.type === "SET_AUDIO_SOURCES") {
            handleSetAudioSources({ sources: event.sources });
          }
          break;
        }

        case "SCHEDULED_ACTION": {
          const { scheduledAction, serverTimeToExecute } = response;
          switch (scheduledAction.type) {
            case "PLAY": {
              if (
                scheduledAction.sourceType === "appleMusic" &&
                scheduledAction.appleMusicTrackId
              ) {
                const musicKit = (window as any).MusicKit?.getInstance?.();
                if (musicKit) {
                  musicKit
                    .setQueue({ song: scheduledAction.appleMusicTrackId })
                    .then(() => {
                      if (typeof scheduledAction.appleMusicPosition === "number") {
                        musicKit.seekToTime(scheduledAction.appleMusicPosition);
                      }
                      musicKit.play();
                    })
                    .catch((err: any) => console.error("Apple MusicKit error:", err));
                }
              } else {
                schedulePlay({
                  trackTimeSeconds: scheduledAction.trackTimeSeconds,
                  targetServerTime: serverTimeToExecute,
                  audioSource: scheduledAction.audioSource,
                });
              }
              break;
            }

            case "PAUSE":
              schedulePause({ targetServerTime: serverTimeToExecute });
              break;

            case "SPATIAL_CONFIG":
              processSpatialConfig(scheduledAction);
              if (!isSpatialAudioEnabled) {
                setIsSpatialAudioEnabled(true);
              }
              break;

            case "STOP_SPATIAL_AUDIO":
              processStopSpatialAudio();
              break;
          }
          break;
        }

        case "SET_CLIENT_ID":
          setUserId(response.clientId);
          break;

        default:
          console.warn("Unknown WS response type", response);
      }
    };

    return ws;
  };

  useEffect(() => {
    if (isLoadingRoom || !roomId || !username) return;
    if (socket) return;

    const ws = createConnection();

    return () => {
      console.log("[WebSocket] Cleanup");
      cleanupReconnection();
      stopHeartbeat();
      ws.onclose = () => {
        console.log("[WebSocket] Closed (cleanup)");
      };
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingRoom, roomId, username]);

  return null;
};
