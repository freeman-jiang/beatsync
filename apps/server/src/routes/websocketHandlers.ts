import {
  ClientActionEnum,
  epochNow,
  WSBroadcastType,
  WSRequestSchema,
  YouTubeSyncType, // ✅ NEW
} from "@beatsync/shared";
import { Server, ServerWebSocket } from "bun";
import { SCHEDULE_TIME_MS } from "../config";
import { roomManager } from "../roomManager";
import { sendBroadcast, sendUnicast } from "../utils/responses";
import { WSData } from "../utils/websocket";

const createClientUpdate = (roomId: string) => {
  const message: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: ClientActionEnum.Enum.CLIENT_CHANGE,
      clients: roomManager.getClients(roomId),
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
  roomManager.addClient(ws);

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
        `Room: ${roomId} | User: ${username} | Message: ${JSON.stringify(parsedMessage)}`
      );
    }

    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
      sendUnicast({
        ws,
        message: {
          type: "NTP_RESPONSE",
          t0: parsedMessage.t0,
          t1,
          t2: epochNow(),
        },
      });
      return;
    }

    if (
      parsedMessage.type === ClientActionEnum.enum.PLAY ||
      parsedMessage.type === ClientActionEnum.enum.PAUSE
    ) {
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "SCHEDULED_ACTION",
          scheduledAction: parsedMessage,
          serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
        },
      });
      return;
    }

    if (parsedMessage.type === ClientActionEnum.enum.START_SPATIAL_AUDIO) {
      const room = roomManager.getRoomState(roomId);
      if (!room || room.intervalId) return;
      roomManager.startInterval({ server, roomId });
    }

    else if (parsedMessage.type === ClientActionEnum.enum.STOP_SPATIAL_AUDIO) {
      const message: WSBroadcastType = {
        type: "SCHEDULED_ACTION",
        scheduledAction: { type: "STOP_SPATIAL_AUDIO" },
        serverTimeToExecute: epochNow() + 0,
      };

      sendBroadcast({ server, roomId, message });

      const room = roomManager.getRoomState(roomId);
      if (!room || !room.intervalId) return;

      roomManager.stopInterval(roomId);
    }

    else if (parsedMessage.type === ClientActionEnum.enum.REUPLOAD_AUDIO) {
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "NEW_AUDIO_SOURCE",
            id: parsedMessage.audioId,
            title: parsedMessage.audioName,
            duration: 1,
            addedAt: Date.now(),
            addedBy: roomId,
          },
        },
      });
    }

    else if (parsedMessage.type === ClientActionEnum.enum.REORDER_CLIENT) {
      const reorderedClients = roomManager.reorderClients({
        roomId,
        clientId: parsedMessage.clientId,
        server,
      });

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
    }

    else if (parsedMessage.type === ClientActionEnum.enum.SET_LISTENING_SOURCE) {
      roomManager.updateListeningSource({
        roomId,
        position: parsedMessage,
        server,
      });
    }

    else if (parsedMessage.type === ClientActionEnum.enum.MOVE_CLIENT) {
      roomManager.moveClient({ parsedMessage, roomId, server });
    }

    // ✅ NEW: Handle YouTube sync messages
    else if (parsedMessage.type === ClientActionEnum.enum.YOUTUBE_SYNC) {
      const payload = parsedMessage.payload as YouTubeSyncType["payload"];

      const message: WSBroadcastType = {
        type: "YOUTUBE_SYNC",
        payload,
      };

      sendBroadcast({ server, roomId, message });
    }

    else {
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

    await roomManager.removeClient(ws.data.roomId, ws.data.clientId);

    const message = createClientUpdate(ws.data.roomId);
    ws.unsubscribe(ws.data.roomId);
    server.publish(ws.data.roomId, JSON.stringify(message));
  } catch (error) {
    console.error(`Error handling WebSocket close for ${ws.data?.username}:`, error);
  }
};
