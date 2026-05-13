// Tests for the map-room initial-state burst in handleOpen:
//   - First connecting client locks the room's type via ws.data.requestedRoomType
//   - Every client gets ROOM_TYPE_INFO on connect
//   - Map rooms with shapes get SHAPES_UPDATE in the burst
//   - Map rooms with playing playlists get unicast SCHEDULED_ACTION/PLAY (resume)

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

function findEvent<E extends string>(sent: WSBroadcastType[], eventType: E) {
  return sent.find(
    (m): m is Extract<WSBroadcastType, { type: "ROOM_EVENT" }> => m.type === "ROOM_EVENT" && m.event.type === eventType
  );
}

beforeEach(() => {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
});

describe("handleOpen: room type seeding", () => {
  it("first client with requestedRoomType=map locks the room to map", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    ws.data.requestedRoomType = "map";
    handleOpen(ws, createMockServer());
    expect(globalManager.getRoom("r1")?.getRoomType()).toBe("map");
  });

  it("a later client requesting audio cannot flip an already-map room", () => {
    const ws1 = createMockWs({ clientId: "c1", roomId: "r1" });
    ws1.data.requestedRoomType = "map";
    handleOpen(ws1, createMockServer());

    const ws2 = createMockWs({ clientId: "c2", roomId: "r1" });
    ws2.data.requestedRoomType = "audio";
    handleOpen(ws2, createMockServer());

    expect(globalManager.getRoom("r1")?.getRoomType()).toBe("map");
  });

  it("no requestedRoomType keeps the room as audio (the default)", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(globalManager.getRoom("r1")?.getRoomType()).toBe("audio");
  });
});

describe("handleOpen: ROOM_TYPE_INFO", () => {
  it("sends ROOM_TYPE_INFO with audio for default rooms", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    const ev = findEvent(getWsSentMessages(ws), "ROOM_TYPE_INFO");
    expect(ev).toBeTruthy();
    if (ev?.event.type !== "ROOM_TYPE_INFO") throw new Error("unreachable");
    expect(ev.event.roomType).toBe("audio");
    expect(ev.event.mapMetadata).toBeUndefined();
  });

  it("sends ROOM_TYPE_INFO with map + metadata for map rooms", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    const ev = findEvent(getWsSentMessages(ws), "ROOM_TYPE_INFO");
    if (ev?.event.type !== "ROOM_TYPE_INFO") throw new Error("unreachable");
    expect(ev.event.roomType).toBe("map");
    expect(ev.event.mapMetadata).toEqual({ center: [42.28, -83.74], zoom: 17 });
  });
});

describe("handleOpen: SHAPES_UPDATE for map rooms", () => {
  it("does NOT send SHAPES_UPDATE for audio rooms", () => {
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(findEvent(getWsSentMessages(ws), "SHAPES_UPDATE")).toBeUndefined();
  });

  it("does NOT send SHAPES_UPDATE for empty map rooms", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    expect(findEvent(getWsSentMessages(ws), "SHAPES_UPDATE")).toBeUndefined();
  });

  it("sends a SHAPES_UPDATE listing every shape on connect", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.addShape({
      id: "s1",
      type: "polygon",
      coordinates: [],
      createdBy: "x",
      createdAt: 0,
      groupId: null,
      falloffMeters: 25,
    });
    room.addShape({
      id: "s2",
      type: "circle",
      coordinates: { center: [0, 0], radius: 50 },
      createdBy: "x",
      createdAt: 0,
      groupId: null,
      falloffMeters: 25,
    });

    const ws = createMockWs({ clientId: "c1", roomId: "r1" });
    handleOpen(ws, createMockServer());
    const ev = findEvent(getWsSentMessages(ws), "SHAPES_UPDATE");
    if (ev?.event.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(ev.event.shapes.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });
});

describe("handleOpen: per-context resume on connect", () => {
  it("sends a unicast SCHEDULED_ACTION/PLAY for every playing context", () => {
    const room = globalManager.getOrCreateRoom("r1");
    room.setRoomType("map");
    room.addShape({
      id: "s1",
      type: "polygon",
      coordinates: [],
      createdBy: "x",
      createdAt: 0,
      groupId: null,
      falloffMeters: 25,
    });
    room.addTrackToContext("s1", { url: "track.mp3" });
    // Pretend playback started 2 seconds ago at position 5s.
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", contextId: "s1", audioSource: "track.mp3", trackTimeSeconds: 5 },
      Date.now() - 2000
    );

    const ws = createMockWs({ clientId: "late", roomId: "r1" });
    handleOpen(ws, createMockServer());

    const sent = getWsSentMessages(ws);
    const scheduled = sent.filter(
      (m): m is Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }> => m.type === "SCHEDULED_ACTION"
    );
    const resume = scheduled.find((s) => s.scheduledAction.type === "PLAY" && s.scheduledAction.contextId === "s1");
    if (resume?.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    // Position bumped forward by the elapsed time + scheduling buffer.
    expect(resume.scheduledAction.trackTimeSeconds).toBeGreaterThan(5);
    expect(resume.scheduledAction.trackTimeSeconds).toBeLessThan(15);
  });
});
