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
      type: ClientActionEnum.enum.CLIENT_CHANGE,
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
  const { audioSources, youtubeSources, currentMode, selectedAudioId, selectedYouTubeId, playbackState } = roomState;
  
  if (audioSources.length > 0) {
    console.log(
      `Sending ${audioSources.length} audio source(s) to newly joined client ${ws.data.username}`
    );
    const audioSourcesMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources: audioSources,
      },
    };
    ws.send(JSON.stringify(audioSourcesMessage));
  }

  // Send YouTube sources to the newly joined client if any exist
  if (youtubeSources && youtubeSources.length > 0) {
    console.log(
      `Sending ${youtubeSources.length} YouTube source(s) to newly joined client ${ws.data.username}`
    );
    const youtubeSourcesMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SET_YOUTUBE_SOURCES",
        sources: youtubeSources,
      },
    };
    ws.send(JSON.stringify(youtubeSourcesMessage));
  }

  // Send current mode to the newly joined client
  if (currentMode) {
    console.log(
      `Sending current mode (${currentMode}) to newly joined client ${ws.data.username}`
    );
    const modeMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "MODE_CHANGE",
        mode: currentMode,
      },
    };
    ws.send(JSON.stringify(modeMessage));
  }

  // Send current selected audio if any
  if (selectedAudioId) {
    console.log(
      `Sending selected audio (${selectedAudioId}) to newly joined client ${ws.data.username}`
    );
    const selectedAudioMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SELECTED_AUDIO_CHANGE",
        audioId: selectedAudioId,
      },
    };
    ws.send(JSON.stringify(selectedAudioMessage));
  }

  // Send current selected YouTube video if any
  if (selectedYouTubeId) {
    console.log(
      `Sending selected YouTube video (${selectedYouTubeId}) to newly joined client ${ws.data.username}`
    );
    const selectedYouTubeMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "SELECTED_YOUTUBE_CHANGE",
        videoId: selectedYouTubeId,
      },
    };
    ws.send(JSON.stringify(selectedYouTubeMessage));
  }

  // Send current playback state if any
  if (playbackState) {
    console.log(
      `Sending playback state (playing: ${playbackState.isPlaying}, time: ${playbackState.currentTime}) to newly joined client ${ws.data.username}`
    );
    const playbackStateMessage: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: {
        type: "PLAYBACK_STATE",
        isPlaying: playbackState.isPlaying,
        currentTime: playbackState.currentTime,
        lastUpdated: playbackState.lastUpdated,
        selectedAudioId,
        selectedYouTubeId,
      },
    };
    ws.send(JSON.stringify(playbackStateMessage));
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
      parsedMessage.type === ClientActionEnum.enum.PAUSE
    ) {
      // Update room playback state
      const room = globalManager.getRoom(roomId);
      if (room) {
        if (parsedMessage.type === ClientActionEnum.enum.PLAY) {
          room.updatePlaybackState(true, parsedMessage.trackTimeSeconds);
        } else {
          // For pause, we need to get current time - this might need adjustment based on your current implementation
          const currentState = room.getPlaybackState();
          const currentTime = currentState ? currentState.currentTime : 0;
          room.updatePlaybackState(false, currentTime);
        }
      }

      sendBroadcast({
        server,
        roomId,
        message: {
          type: "SCHEDULED_ACTION",
          scheduledAction: parsedMessage,
          serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS, // 500 ms from now
          // TODO: Make the longest RTT + some amount instead of hardcoded this breaks for long RTTs
        },
      });

      return;
    } else if (
      parsedMessage.type === ClientActionEnum.enum.PLAY_YOUTUBE ||
      parsedMessage.type === ClientActionEnum.enum.PAUSE_YOUTUBE ||
      parsedMessage.type === ClientActionEnum.enum.SEEK_YOUTUBE
    ) {
      // Handle YouTube actions the same way as regular audio actions
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "SCHEDULED_ACTION",
          scheduledAction: parsedMessage,
          serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS, // 500 ms from now
        },
      });

      return;
    } else if (parsedMessage.type === ClientActionEnum.enum.SET_MODE) {
      // Handle mode changes and sync across all clients
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      // Update room state
      room.setCurrentMode(parsedMessage.mode);

      // Broadcast mode change to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "MODE_CHANGE",
            mode: parsedMessage.mode,
          },
        },
      });

      return;
    } else if (parsedMessage.type === ClientActionEnum.enum.ADD_YOUTUBE_SOURCE) {
      // Handle adding YouTube sources and sync across all clients
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      const youtubeSource = {
        videoId: parsedMessage.videoId,
        title: parsedMessage.title,
        thumbnail: parsedMessage.thumbnail,
        duration: parsedMessage.duration ?? undefined,
        channel: parsedMessage.channel,
        addedAt: epochNow(),
        addedBy: ws.data.clientId,
      };

      // Add to room state
      room.addYouTubeSource(youtubeSource);

      // Broadcast new YouTube source to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "NEW_YOUTUBE_SOURCE",
            videoId: youtubeSource.videoId,
            title: youtubeSource.title,
            thumbnail: youtubeSource.thumbnail,
            duration: youtubeSource.duration,
            channel: youtubeSource.channel,
            addedAt: youtubeSource.addedAt,
            addedBy: youtubeSource.addedBy,
          },
        },
      });

      return;
    } else if (parsedMessage.type === ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE) {
      // Handle removing YouTube sources and sync across all clients
      const room = globalManager.getRoom(roomId);
      if (!room) return;

      // Remove from room state
      room.removeYouTubeSource(parsedMessage.videoId);

      // Broadcast YouTube source removal to all clients
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "REMOVE_YOUTUBE_SOURCE",
            videoId: parsedMessage.videoId,
            removedBy: ws.data.clientId,
          },
        },
      });

      return;
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
            type: ClientActionEnum.enum.CLIENT_CHANGE,
            clients: reorderedClients,
          },
        },
      });
    } else if (parsedMessage.type === ClientActionEnum.enum.SET_SELECTED_AUDIO) {
      // Handle audio selection change
      const room = globalManager.getRoom(roomId);
      if (room) {
        room.setSelectedAudioId(parsedMessage.audioId);
      }

      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SELECTED_AUDIO_CHANGE",
            audioId: parsedMessage.audioId,
          },
        },
      });
    } else if (parsedMessage.type === ClientActionEnum.enum.SET_SELECTED_YOUTUBE) {
      // Handle YouTube selection change
      const room = globalManager.getRoom(roomId);
      if (room) {
        room.setSelectedYouTubeId(parsedMessage.videoId);
      }

      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SELECTED_YOUTUBE_CHANGE",
            videoId: parsedMessage.videoId,
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
