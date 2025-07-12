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
  const { audioSources } = room.getState();
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
    // Send directly to the WebSocket since this is a broadcast-type message sent to a single client
    ws.send(JSON.stringify(audioSourcesMessage));
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
        `Room: ${roomId} | User: ${username} | Message: ${JSON.stringify(
          parsedMessage
        )}`
      );
    }

    // NTP Request
    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
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

      // Check if room has no active connections
      if (!room.hasActiveConnections()) {
        room.stopSpatialAudio();
        // Schedule cleanup with 3 second delay
        globalManager.scheduleRoomCleanup(roomId, 3000);
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
