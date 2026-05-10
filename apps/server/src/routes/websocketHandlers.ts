import { IS_DEMO_MODE } from "@/demo";
import { globalManager } from "@/managers";
import { sendBroadcast, sendToClient, sendUnicast } from "@/utils/responses";
import type { BunServer, WSData } from "@/utils/websocket";
import { dispatchMessage } from "@/websocket/dispatch";
import type { WSBroadcastType } from "@beatsync/shared";
import { epochNow, WSRequestSchema } from "@beatsync/shared";
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

function debouncedDemoUserCountBroadcast(server: BunServer, roomId: string): void {
  const room = globalManager.getRoom(roomId);
  if (!room) return;
  room.scheduleClientChangeBroadcast(() => {
    sendBroadcast({
      server,
      roomId,
      message: { type: "DEMO_USER_COUNT", count: room.getNumClients() },
    });
  });
}

export const handleOpen = (ws: ServerWebSocket<WSData>, server: BunServer) => {
  console.log(`WebSocket connection opened for user ${ws.data.username} in room ${ws.data.roomId}`);

  const { roomId, requestedRoomType } = ws.data;
  ws.subscribe(roomId);

  const room = globalManager.getOrCreateRoom(roomId);

  // First-connection wins: if the room has no clients yet AND the client requested a
  // specific roomType, lock the room to that type. Otherwise the room's existing type
  // (default "audio") is preserved and subsequent requests with a different type are
  // ignored — the client will see ROOM_TYPE_INFO and can decide how to render.
  if (requestedRoomType && room.getClients().length === 0) {
    try {
      room.setRoomType(requestedRoomType);
    } catch (err) {
      // Defensive — getClients() race or restore-time mismatch. Log and continue.
      console.warn(`Could not set room ${roomId} type to ${requestedRoomType}: ${(err as Error).message}`);
    }
  }

  room.addClient(ws);

  const { audioSources, globalVolume, lowPassFreq } = room.getState();
  const now = epochNow();

  // Always tell the client what kind of room they joined so it can mount the right UI.
  sendToClient({
    ws,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "ROOM_TYPE_INFO",
        roomType: room.getRoomType(),
        ...(room.getMapMetadata() && { mapMetadata: room.getMapMetadata() }),
      },
    },
  });

  // Send audio sources to the newly joined client
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
      serverTimeToExecute: now,
      scheduledAction: {
        type: "GLOBAL_VOLUME_CONFIG",
        volume: globalVolume,
        rampTime: 0.1,
      },
    },
  });

  sendUnicast({
    ws,
    message: {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: now,
      scheduledAction: {
        type: "METRONOME_CONFIG",
        enabled: room.getIsMetronomeEnabled(),
      },
    },
  });

  sendUnicast({
    ws,
    message: {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: now,
      scheduledAction: {
        type: "LOW_PASS_CONFIG",
        freq: lowPassFreq,
        rampTime: 0.05,
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
    // Broadcast updated user count to all clients
    debouncedDemoUserCountBroadcast(server, roomId);
    // Send current audio ready count to the newly joined client
    sendToClient({
      ws,
      message: { type: "DEMO_AUDIO_READY_COUNT", count: room.getDemoAudioReadyCount() },
    });
  } else {
    // Unicast full client list to the joining client immediately
    sendToClient({ ws, message: createClientUpdate(roomId) });
    // Broadcast to others: debounced
    debouncedClientChangeBroadcast(server, roomId);
  }

  // Map-room-specific initial state: shape snapshot + resume PLAY for any shape that's
  // already playing so late joiners can seek into the loop.
  if (room.isMapRoom()) {
    const shapeStates = room.getShapeStates();
    if (shapeStates.length > 0) {
      sendToClient({
        ws,
        message: {
          type: "ROOM_EVENT",
          event: { type: "SHAPES_UPDATE", shapes: shapeStates },
        },
      });

      // Resume playing shapes: send a unicast SCHEDULED_ACTION that tells the client where
      // to seek into the track. The same dynamic-schedule + extra-offset logic used by
      // syncClient applies — we add a buffer so the client has time to load the buffer.
      for (const state of shapeStates) {
        if (state.playbackState.type !== "playing") continue;
        const serverTimeWhenStarted = state.playbackState.serverTimeToExecute;
        const trackPosWhenStarted = state.playbackState.trackPositionSeconds;
        const serverTimeToExecute = room.getScheduledExecutionTime({ extraOffsetMs: 1500 });
        const resumeTrackSeconds = trackPosWhenStarted + (serverTimeToExecute - serverTimeWhenStarted) / 1000;
        sendUnicast({
          ws,
          message: {
            type: "SCHEDULED_ACTION",
            serverTimeToExecute,
            scheduledAction: {
              type: "PLAY",
              shapeId: state.shape.id,
              audioSource: state.playbackState.audioSource,
              trackTimeSeconds: resumeTrackSeconds,
            },
          },
        });
      }
    }
  }
};

export const handleMessage = async (ws: ServerWebSocket<WSData>, message: string | Buffer, server: BunServer) => {
  const t1 = epochNow(); // Always capture immediately on receive
  const { roomId, username } = ws.data;

  try {
    const parsedData: unknown = JSON.parse(message.toString());

    // Fast path: NTP requests skip Zod validation and dispatch overhead.
    // t1 is already captured above; t2 is captured right before ws.send()
    // to minimize server processing time contaminating the timestamps.
    if ((parsedData as { type?: string })?.type === "NTP_REQUEST") {
      const msg = parsedData as {
        t0: number;
        clientRTT?: number;
        clientCompensationMs?: number;
        clientNudgeMs?: number;
        probeGroupId: number;
        probeGroupIndex: number;
      };

      const room = globalManager.getRoom(roomId);
      if (room) {
        room.processNTPRequestFrom({
          clientId: ws.data.clientId,
          clientRTT: msg.clientRTT,
          clientCompensationMs: msg.clientCompensationMs,
          clientNudgeMs: msg.clientNudgeMs,
        });
      }

      // Capture t2 as late as possible — right before send
      const response = JSON.stringify({
        type: "NTP_RESPONSE",
        t0: msg.t0,
        t1,
        t2: epochNow(),
        probeGroupId: msg.probeGroupId,
        probeGroupIndex: msg.probeGroupIndex,
      });
      ws.send(response);
      return;
    }

    const parsedMessage = WSRequestSchema.parse(parsedData);
    console.log(`[Room: ${roomId}] | User: ${username} | Message: ${JSON.stringify(parsedMessage)}`);

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
        room.clearClientChangeBroadcast();
        globalManager.scheduleRoomCleanup(roomId);
      }
    }

    ws.unsubscribe(roomId);

    // Only broadcast if there are still clients to receive it
    if (room?.hasActiveConnections()) {
      if (IS_DEMO_MODE) {
        debouncedDemoUserCountBroadcast(server, roomId);
      } else {
        debouncedClientChangeBroadcast(server, roomId);
      }
    }
  } catch (error) {
    console.error(`Error handling WebSocket close for ${ws.data?.username}:`, error);
  }
};
