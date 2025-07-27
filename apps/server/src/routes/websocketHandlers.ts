import {
  ClientActionEnum,
  epochNow,
  WSBroadcastType,
  WSRequestSchema,
} from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { SCHEDULE_TIME_MS } from "../config";
import { globalManager } from "../managers";
import { sendBroadcast } from "../utils/responses";
import { WSData } from "../utils/websocket";
import { dispatchMessage } from "../websocket/dispatch";

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

export const handleOpen = (ws: ServerWebSocket<WSData>, server: Server) => {
  console.log(
    `WebSocket connection opened for user ${ws.data.username} in room ${ws.data.roomId}`
  );
  // Client already knows its ID from PostHog, no need to send SET_CLIENT_ID

  const { roomId } = ws.data;
  ws.subscribe(roomId);

  const room = globalManager.getOrCreateRoom(roomId);
  room.addClient(ws);

  // Send audio sources to the newly joined client if any exist
  const roomState = room.getState();
  if (roomState.audioSources.length > 0) {
    console.log(
      `Sending ${roomState.audioSources.length} audio source(s) to newly joined client ${ws.data.username}`
    );

    // TODO: this is not ideal:
    // - we need to send one message per event, what we are really trying to do is sync this client
    // We should actually just create a single unicast message catching the client up with all of this bundled into one message (even broadcast is fine but it should be one message)
    // just the issue is that we do diff instead of full state sync
    const audioSourcesMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources: roomState.audioSources,
      },
    };

    // Send directly to the WebSocket since this is a broadcast-type message sent to a single client
    ws.send(JSON.stringify(audioSourcesMessage));
  }

  // Send YouTube sources to the newly joined client if any exist
  if (roomState.youtubeSources.length > 0) {
    console.log(
      `Sending ${roomState.youtubeSources.length} YouTube source(s) to newly joined client ${ws.data.username}`
    );
    const youtubeSourcesMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_YOUTUBE_SOURCES",
        sources: roomState.youtubeSources,
      },
    };
    ws.send(JSON.stringify(youtubeSourcesMessage));
  }

  // Send current mode to newly joined client
  const currentModeMessage: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: "SET_CURRENT_MODE",
      mode: roomState.currentMode,
    },
  };
  ws.send(JSON.stringify(currentModeMessage));

  // Send current selections to newly joined client
  if (roomState.selectedAudioUrl) {
    const selectedAudioMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_SELECTED_AUDIO",
        audioUrl: roomState.selectedAudioUrl,
      },
    };
    ws.send(JSON.stringify(selectedAudioMessage));
  }

  if (roomState.selectedYouTubeId) {
    const selectedYouTubeMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_SELECTED_YOUTUBE",
        videoId: roomState.selectedYouTubeId,
      },
    };
    ws.send(JSON.stringify(selectedYouTubeMessage));
  }

  // Always send the current playback controls
  const playbackControlsMessage: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: "SET_PLAYBACK_CONTROLS",
      permissions: room.getPlaybackControlsPermissions(),
    },
  };
  ws.send(JSON.stringify(playbackControlsMessage));

  const message = createClientUpdate(roomId);
  sendBroadcast({ server, roomId, message });
};

export const handleMessage = async (
  ws: ServerWebSocket<WSData>,
  message: string | Buffer,
  server: Server
) => {
  const t1 = epochNow(); // Always calculate this immediately
  const { roomId, username } = ws.data;

  try {
    const parsedData = JSON.parse(message.toString());
    const parsedMessage = WSRequestSchema.parse(parsedData);

    if (parsedMessage.type !== ClientActionEnum.enum.NTP_REQUEST) {
      console.log(
        `[Room: ${roomId}] | User: ${username} | Message: ${JSON.stringify(
          parsedMessage
        )}`
      );
    }

    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
     // Manually mutate the message to include the t1 timestamp
      parsedMessage.t1 = t1;
    }

    // Delegate to type-safe dispatcher
    await dispatchMessage({ ws, message: parsedMessage, server });

  } catch (error) {
    console.error("Invalid message format:", error);
    ws.send(
      JSON.stringify({ type: "ERROR", message: "Invalid message format" })
    );
  }
};

export const handleClose = async (
  ws: ServerWebSocket<WSData>,
  server: Server
) => {
  try {
    console.log(
      `WebSocket connection closed for user ${ws.data.username} in room ${ws.data.roomId}`
    );

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

    const message = createClientUpdate(roomId);
    ws.unsubscribe(roomId);
    server.publish(roomId, JSON.stringify(message));
  } catch (error) {
    console.error(
      `Error handling WebSocket close for ${ws.data?.username}:`,
      error
    );
  }
};
