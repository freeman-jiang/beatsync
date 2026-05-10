// Tests for the map-room initial-state burst in handleOpen, plus the WS upgrade roomType
// query parameter and BackupManager map-state round-trip.

import type { WSBroadcastType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(() => {
    /* noop */
  }),
  sendToClient: mock(({ ws, message }: { ws: ReturnType<typeof createMockWs>; message: WSBroadcastType }) => {
    // sendToClient forwards via ws.send so the test can inspect it via the mock.
    ws.send(JSON.stringify(message));
  }),
  sendUnicast: mock(({ ws, message }: { ws: ReturnType<typeof createMockWs>; message: WSBroadcastType }) => {
    ws.send(JSON.stringify(message));
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

import { handleOpen } from "@/routes/websocketHandlers";

function getWsSentMessages(ws: ReturnType<typeof createMockWs>): WSBroadcastType[] {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const sendMock = ws.send as ReturnType<typeof mock>;
  return sendMock.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string) as WSBroadcastType);
}

function findRoomEvent<E extends string>(
  sent: WSBroadcastType[],
  eventType: E
): Extract<WSBroadcastType, { type: "ROOM_EVENT" }> | undefined {
  return sent.find(
    (m): m is Extract<WSBroadcastType, { type: "ROOM_EVENT" }> => m.type === "ROOM_EVENT" && m.event.type === eventType
  );
}

function makeShape(id: string) {
  return {
    id,
    type: "polygon",
    coordinates: [],
    createdBy: "creator",
    createdAt: 0,
    loop: true,
    groupId: null,
    audibleRadiusMeters: 50,
  };
}

beforeEach(() => {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
});

describe("handleOpen: room type seeding", () => {
  it("first client with requestedRoomType=map locks the room to map type", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    ws.data.requestedRoomType = "map";
    handleOpen(ws, createMockServer());

    const room = globalManager.getRoom("r1");
    expect(room?.getRoomType()).toBe("map");
  });

  it("a second client requesting a different type does not flip the room", () => {
    const ws1 = createMockWs({ clientId: "c1", roomId: "r1" });
    ws1.data.requestedRoomType = "map";
    handleOpen(ws1, createMockServer());

    const ws2 = createMockWs({ clientId: "c2", roomId: "r1" });
    ws2.data.requestedRoomType = "audio";
    handleOpen(ws2, createMockServer());

    expect(globalManager.getRoom("r1")?.getRoomType()).toBe("map");
  });

  it("no requestedRoomType keeps the room as the default audio type", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(globalManager.getRoom("r1")?.getRoomType()).toBe("audio");
  });
});

describe("handleOpen: ROOM_TYPE_INFO burst", () => {
  it("sends ROOM_TYPE_INFO with roomType=audio for default rooms", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    const ev = findRoomEvent(getWsSentMessages(ws), "ROOM_TYPE_INFO");
    expect(ev).toBeTruthy();
    if (ev?.event.type !== "ROOM_TYPE_INFO") throw new Error("unreachable");
    expect(ev.event.roomType).toBe("audio");
    expect(ev.event.mapMetadata).toBeUndefined();
  });

  it("sends ROOM_TYPE_INFO with roomType=map and metadata for map rooms", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });

    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());

    const ev = findRoomEvent(getWsSentMessages(ws), "ROOM_TYPE_INFO");
    expect(ev).toBeTruthy();
    if (ev?.event.type !== "ROOM_TYPE_INFO") throw new Error("unreachable");
    expect(ev.event.roomType).toBe("map");
    expect(ev.event.mapMetadata).toEqual({ center: [42.28, -83.74], zoom: 17 });
  });
});

describe("handleOpen: SHAPES_UPDATE burst", () => {
  it("does NOT send SHAPES_UPDATE for audio rooms", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(findRoomEvent(getWsSentMessages(ws), "SHAPES_UPDATE")).toBeUndefined();
  });

  it("does NOT send SHAPES_UPDATE for empty map rooms (no shapes yet)", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(findRoomEvent(getWsSentMessages(ws), "SHAPES_UPDATE")).toBeUndefined();
  });

  it("sends a SHAPES_UPDATE with the current shape list for map rooms", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    room.addShapeAudioSource("s1", { url: "track.mp3" });

    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());

    const ev = findRoomEvent(getWsSentMessages(ws), "SHAPES_UPDATE");
    expect(ev).toBeTruthy();
    if (ev?.event.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(ev.event.shapes.map((s) => s.shape.id).sort()).toEqual(["s1", "s2"]);
    const s1 = ev.event.shapes.find((s) => s.shape.id === "s1")!;
    expect(s1.playlist).toEqual([{ url: "track.mp3" }]);
  });

  it("resumes a playing shape with a unicast SCHEDULED_ACTION", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track.mp3" });
    // Pretend the shape started playing 2 seconds ago at track position 5s.
    room.updateShapePlaybackPlay(
      "s1",
      { type: "PLAY", shapeId: "s1", audioSource: "track.mp3", trackTimeSeconds: 5 },
      Date.now() - 2000
    );

    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());

    const sent = getWsSentMessages(ws);
    const scheduled = sent.filter(
      (m): m is Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }> => m.type === "SCHEDULED_ACTION"
    );
    const playForShape = scheduled.find((s) => s.scheduledAction.type === "PLAY" && s.scheduledAction.shapeId === "s1");
    expect(playForShape).toBeTruthy();
    if (playForShape?.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    // Resume position should be ~ 5 (start) + 2 (elapsed) + scheduling delay
    expect(playForShape.scheduledAction.trackTimeSeconds).toBeGreaterThan(6);
    expect(playForShape.scheduledAction.trackTimeSeconds).toBeLessThan(15);
  });
});
