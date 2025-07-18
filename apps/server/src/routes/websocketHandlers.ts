import {
  ClientActionEnum,
  epochNow,
  WSBroadcastType,
  WSRequestSchema,
} from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { SCHEDULE_TIME_MS } from "../config";
import { globalManager } from "../managers";
import { sendBroadcast, sendUnicast } from "../utils/responses";
import { WSData } from "../utils/websocket";

const createClientUpdate = (roomId: string) => {
  const room = globalManager.getRoom(roomId);
  const message: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: ClientActionEnum.Enum.CLIENT_CHANGE,
      clients: room ? room.getClients() : [],
    },
  };
  return message;
};

export const handleOpen = (ws: ServerWebSocket<WSData>, server: Server) => {
  console.log(
    `WebSocket connection opened for user ${ws.data.username} in room ${ws.data.roomId}`
  );
  sendUnicast({
    ws,
    message: {
      type: "SET_CLIENT_ID",
      clientId: ws.data.clientId,
    },
  });

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

  const message = createClientUpdate(roomId);
  sendBroadcast({ server, roomId, message });
};

export const handleMessage = async (
  ws: ServerWebSocket<WSData>,
  message: string | Buffer,
  server: Server
) => {
  const t1 = epochNow();
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

    // NTP Request
    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
      // Update heartbeat for client
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      room.processNTPRequestFrom(ws.data.clientId);

      sendUnicast({
        ws,
        message: {
          type: "NTP_RESPONSE",
          t0: parsedMessage.t0, // Echo back the client's t0
          t1, // Server receive time
          t2: epochNow(), // Server send time
        },
      });

      return;
    } else if (
      parsedMessage.type === ClientActionEnum.enum.PLAY ||
      parsedMessage.type === ClientActionEnum.enum.PAUSE ||
      parsedMessage.type === ClientActionEnum.enum.PLAY_YOUTUBE ||
      parsedMessage.type === ClientActionEnum.enum.PAUSE_YOUTUBE ||
      parsedMessage.type === ClientActionEnum.enum.SEEK_YOUTUBE
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      const serverTimeToExecute = epochNow() + SCHEDULE_TIME_MS;

      // Update playback state based on action type
      if (parsedMessage.type === ClientActionEnum.enum.PLAY) {
        room.updatePlaybackSchedulePlay(parsedMessage, serverTimeToExecute);
      } else if (parsedMessage.type === ClientActionEnum.enum.PAUSE) {
        room.updatePlaybackSchedulePause(parsedMessage, serverTimeToExecute);
      } else if (parsedMessage.type === ClientActionEnum.enum.PLAY_YOUTUBE) {
        room.updatePlaybackSchedulePlayYouTube(parsedMessage, serverTimeToExecute);
      } else if (parsedMessage.type === ClientActionEnum.enum.PAUSE_YOUTUBE) {
        room.updatePlaybackSchedulePauseYouTube(parsedMessage, serverTimeToExecute);
      } else if (parsedMessage.type === ClientActionEnum.enum.SEEK_YOUTUBE) {
        room.updatePlaybackScheduleSeekYouTube(parsedMessage, serverTimeToExecute);
      }

      sendBroadcast({
        server,
        roomId,
        message: {
          type: "SCHEDULED_ACTION",
          scheduledAction: parsedMessage,
          serverTimeToExecute: serverTimeToExecute,
          // TODO: Make the longest RTT + some amount instead of hardcoded this breaks for long RTTs
        },
      });

      return;
    } else if (
      parsedMessage.type === ClientActionEnum.enum.ADD_YOUTUBE_SOURCE
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      
      room.addYouTubeSource(parsedMessage.source);
      
      // Broadcast updated YouTube sources to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_YOUTUBE_SOURCES",
            sources: room.getState().youtubeSources,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      
      room.removeYouTubeSource(parsedMessage.videoId);
      
      // Broadcast updated YouTube sources to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_YOUTUBE_SOURCES",
            sources: room.getState().youtubeSources,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.SET_MODE
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      
      room.setCurrentMode(parsedMessage.mode);
      
      // Broadcast mode change to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_CURRENT_MODE",
            mode: parsedMessage.mode,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.SET_SELECTED_AUDIO
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      
      room.setSelectedAudio(parsedMessage.audioUrl);
      
      // Broadcast selection change to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_SELECTED_AUDIO",
            audioUrl: parsedMessage.audioUrl,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.SET_SELECTED_YOUTUBE
    ) {
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      
      room.setSelectedYouTube(parsedMessage.videoId);
      
      // Broadcast selection change to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_SELECTED_YOUTUBE",
            videoId: parsedMessage.videoId,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.START_SPATIAL_AUDIO
    ) {
      // Start loop only if not already started
      const room = globalManager.getRoom(roomId);
      if (!room) return; // do nothing if no room exists

      room.startSpatialAudio(server);
    } else if (
      parsedMessage.type === ClientActionEnum.enum.STOP_SPATIAL_AUDIO
    ) {
      // This important for
      const message: WSBroadcastType = {
        type: "SCHEDULED_ACTION",
        scheduledAction: {
          type: "STOP_SPATIAL_AUDIO",
        },
        serverTimeToExecute: epochNow() + 0,
      };

      // Reset all gains:
      sendBroadcast({ server, roomId, message });

      // Stop the spatial audio interval if it exists
      const room = globalManager.getRoom(roomId);
      if (!room) return; // do nothing if no room exists

      room.stopSpatialAudio();
    } else if (parsedMessage.type === ClientActionEnum.enum.REORDER_CLIENT) {
      // Handle client reordering
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      const reorderedClients = room.reorderClients(
        parsedMessage.clientId,
        server
      );

      // Broadcast the updated client order to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: ClientActionEnum.Enum.CLIENT_CHANGE,
            clients: reorderedClients,
          },
        },
      });
    } else if (
      parsedMessage.type === ClientActionEnum.enum.SET_LISTENING_SOURCE
    ) {
      // Handle listening source update
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      room.updateListeningSource(parsedMessage, server);
    } else if (parsedMessage.type === ClientActionEnum.enum.MOVE_CLIENT) {
      // Handle client move
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      room.moveClient(parsedMessage.clientId, parsedMessage.position, server);
    } else if (parsedMessage.type === ClientActionEnum.enum.SYNC) {
      // Handle sync request from new client
      const room = globalManager.getRoom(roomId);
      if (!room) return;
      room.syncClient(ws);
    } else {
      console.log(`UNRECOGNIZED MESSAGE: ${JSON.stringify(parsedMessage)}`);
    }
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
