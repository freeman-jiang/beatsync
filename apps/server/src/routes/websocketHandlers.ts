import { IS_DEMO_MODE } from "@/demo";
import { globalManager } from "@/managers";
import { sendBroadcast, sendToClient, sendUnicast } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";
import { dispatchMessage } from "@/websocket/dispatch";
import type { WSBroadcastType } from "@beatsync/shared";
import { ClientActionEnum, epochNow, WSRequestSchema } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";

const createClientUpdate = (roomId: string) => {
  const room = globalManager.getRoom(roomId);
  const message: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: "CLIENT_CHANGE",
      clients: room ? room.getClients() : [],
    },
  };
  return message;
};

function debouncedClientChangeBroadcast(server: BunServer, roomId: string): void {
  const room = globalManager.getRoom(roomId);
  if (!room) return;
  room.scheduleClientChangeBroadcast(() => {
    sendBroadcast({ server, roomId, message: createClientUpdate(roomId) });
  });
}

export const handleOpen = (ws: ServerWebSocket<WSData>, server: BunServer) => {
  console.log(`WebSocket connection opened for user ${ws.data.username} in room ${ws.data.roomId}`);

  const { roomId } = ws.data;
  ws.subscribe(roomId);

  const room = globalManager.getOrCreateRoom(roomId);
  room.addClient(ws);

  // Send audio sources to the newly joined client
  const { audioSources } = room.getState();
  if (audioSources.length > 0) {
    console.log(`Sending ${audioSources.length} audio source(s) to newly joined client ${ws.data.username}`);

    sendToClient({
      ws,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "SET_AUDIO_SOURCES",
          sources: audioSources,
          currentAudioSource: room.getPlaybackState().audioSource || undefined,
        },
      },
    });
  }

  sendToClient({
    ws,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_PLAYBACK_CONTROLS",
        permissions: room.getPlaybackControlsPermissions(),
      },
    },
  });

  sendUnicast({
    ws,
    message: {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow(),
      scheduledAction: {
        type: "GLOBAL_VOLUME_CONFIG",
        volume: room.getState().globalVolume,
        rampTime: 0.1,
      },
    },
  });

  sendUnicast({
    ws,
    message: {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow(),
      scheduledAction: {
        type: "METRONOME_CONFIG",
        enabled: room.getIsMetronomeEnabled(),
      },
    },
  });

  const messages = room.getFullChatHistory();
  if (messages.length > 0) {
    sendToClient({
      ws,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "CHAT_UPDATE",
          messages: messages,
          isFullSync: true,
          newestId: room.getNewestChatId(),
        },
      },
    });
  }

  if (IS_DEMO_MODE) {
    // In demo mode, only send this client's own entry (no point sending thousands of stale entries)
    const self = globalManager.getRoom(roomId)?.getClient(ws.data.clientId);
    sendToClient({
      ws,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "CLIENT_CHANGE",
          clients: self ? [self] : [],
        },
      },
    });
  } else {
    // Unicast full client list to the joining client immediately
    sendToClient({ ws, message: createClientUpdate(roomId) });
    // Broadcast to others: debounced
    debouncedClientChangeBroadcast(server, roomId);
  }
};

export const handleMessage = async (ws: ServerWebSocket<WSData>, message: string | Buffer, server: BunServer) => {
  const t1 = epochNow(); // Always calculate this immediately
  const { roomId, username } = ws.data;

  try {
    const parsedData: unknown = JSON.parse(message.toString());
    const parsedMessage = WSRequestSchema.parse(parsedData);

    if (parsedMessage.type !== ClientActionEnum.enum.NTP_REQUEST) {
      console.log(`[Room: ${roomId}] | User: ${username} | Message: ${JSON.stringify(parsedMessage)}`);
    }

    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
      // Manually mutate the message to include the t1 timestamp
      parsedMessage.t1 = t1;
    }

    // Delegate to type-safe dispatcher
    await dispatchMessage({ ws, message: parsedMessage, server });
  } catch (error) {
    console.error("Invalid message format:", error);
    ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message format" }));
  }
};

export const handleClose = (ws: ServerWebSocket<WSData>, server: BunServer) => {
  try {
    console.log(`WebSocket connection closed for user ${ws.data.username} in room ${ws.data.roomId}`);

    const { roomId, clientId } = ws.data;
    const room = globalManager.getRoom(roomId);

    if (room) {
      room.removeClient(clientId);

      // Schedule cleanup for rooms with no active connections
      if (!room.hasActiveConnections()) {
        room.stopSpatialAudio();
        globalManager.scheduleRoomCleanup(roomId);
      }
    }

    ws.unsubscribe(roomId);

    // Debounced broadcast in prod, skipped in demo mode
    if (!IS_DEMO_MODE) {
      debouncedClientChangeBroadcast(server, roomId);
    }
  } catch (error) {
    console.error(`Error handling WebSocket close for ${ws.data?.username}:`, error);
  }
};
