// Tests handleMessage: JSON parsing, Zod validation, NTP t1 stamping,
// dispatch to handlers, and error handling for malformed messages.

import type { WSBroadcastType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { handleMessage, handleOpen } from "@/routes/websocketHandlers";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "msg-test-room";
const AUDIO_URL = "https://example.com/song.mp3";

describe("handleMessage", () => {
  let server: BunServer;

  beforeEach(() => {
    broadcastMessages = [];
    server = createMockServer();
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  });

  it("should send error for invalid JSON", async () => {
    const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    handleOpen(ws, server);

    await handleMessage(ws, "not json at all{{{", server);

    // ws.send should have been called with an error message
    const sendCalls = (ws.send as ReturnType<typeof mock>).mock.calls;
    const lastMessage = JSON.parse(String(sendCalls[sendCalls.length - 1][0])) as { type: string };
    expect(lastMessage.type).toBe("ERROR");
  });

  it("should send error for valid JSON that fails Zod validation", async () => {
    const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    handleOpen(ws, server);

    await handleMessage(ws, JSON.stringify({ type: "NONEXISTENT_ACTION" }), server);

    const sendCalls = (ws.send as ReturnType<typeof mock>).mock.calls;
    const lastMessage = JSON.parse(String(sendCalls[sendCalls.length - 1][0])) as { type: string };
    expect(lastMessage.type).toBe("ERROR");
  });

  it("should process a valid PAUSE message and update playback state", async () => {
    const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
    handleOpen(ws, server);

    // Add audio and set to playing first
    const room = globalManager.getRoom(ROOM_ID)!;
    room.addAudioSource({ url: AUDIO_URL });
    room.updatePlaybackSchedulePlay({ type: "PLAY", audioSource: AUDIO_URL, trackTimeSeconds: 0 }, Date.now());

    broadcastMessages = [];

    await handleMessage(
      ws,
      JSON.stringify({
        type: "PAUSE",
        audioSource: AUDIO_URL,
        trackTimeSeconds: 15.5,
      }),
      server
    );

    // Should have broadcast a SCHEDULED_ACTION with PAUSE
    const pauseBroadcast = broadcastMessages.find(
      (msg) => msg.message.type === "SCHEDULED_ACTION" && msg.message.scheduledAction.type === "PAUSE"
    );
    expect(pauseBroadcast).toBeTruthy();

    // Playback state should be paused
    expect(room.getPlaybackState().type).toBe("paused");
  });
});
