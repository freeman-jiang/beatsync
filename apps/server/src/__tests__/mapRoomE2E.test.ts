// End-to-end map-room flow test. Simulates the lifecycle a curator + visitor
// would drive: create a map room, draw a shape, add an audio source to it,
// start playback, late-joining visitor receives the resume, admin pauses.
// Drives the WS dispatcher (not direct handler calls) so the test exercises
// Zod validation + registry routing alongside the handlers.

import type { WSBroadcastType, WSRequestType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

let broadcasts: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcasts.push({ server, roomId, message });
    }
  ),
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
import { dispatchMessage } from "@/websocket/dispatch";

const ROOM_ID = "map-e2e";
const TRACK_URL = "https://example.com/track.mp3";

function send(ws: ReturnType<typeof createMockWs>, server: BunServer, message: WSRequestType) {
  return dispatchMessage({ ws, message, server });
}

function makeShape(id: string) {
  return {
    id,
    type: "polygon",
    coordinates: [
      [
        [42.28, -83.74],
        [42.281, -83.74],
        [42.281, -83.741],
      ],
    ],
    createdBy: "admin",
    createdAt: Date.now(),
    groupId: null,
    audibleRadiusMeters: 50,
  };
}

beforeEach(() => {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
  broadcasts = [];
});

describe("map-room E2E", () => {
  it("full curator workflow: create room, draw, add track, play, pause", async () => {
    const server = createMockServer();

    // 1. Admin connects with requestedRoomType=map.
    const adminWs = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    adminWs.data.requestedRoomType = "map";
    handleOpen(adminWs, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getRoomType()).toBe("map");
    expect(room.getClient("admin")?.isAdmin).toBe(true);

    // 2. Set map center.
    await send(adminWs, server, {
      type: "SET_MAP_METADATA",
      metadata: { center: [42.28, -83.74], zoom: 17 },
    });
    expect(room.getMapMetadata()).toEqual({ center: [42.28, -83.74], zoom: 17 });

    // 3. Draw a shape.
    await send(adminWs, server, { type: "ADD_SHAPE", shape: makeShape("s1") });
    expect(room.getShape("s1")).toBeDefined();
    // The matching playlist context exists with loop=true.
    expect(room.getPlaylist("s1")?.loop).toBe(true);

    // 4. Add an audio track to the shape's playlist.
    await send(adminWs, server, {
      type: "ADD_TRACK_TO_CONTEXT",
      contextId: "s1",
      source: { url: TRACK_URL },
    });
    expect(room.getPlaylist("s1")?.tracks).toEqual([{ url: TRACK_URL }]);

    // 5. Visitor joins.
    const visitorWs = createMockWs({ clientId: "visitor", roomId: ROOM_ID });
    handleOpen(visitorWs, server);
    expect(room.getClient("visitor")?.isAdmin).toBe(false);

    // 6. Visitor reports GPS position (no admin required).
    await send(visitorWs, server, { type: "SET_GEO_POSITION", lat: 42.2801, lng: -83.7401 });
    expect(room.getClient("visitor")?.geoPosition).toEqual({ lat: 42.2801, lng: -83.7401 });

    // 7. Visitor tries to draw a shape — rejected (ADMIN_ONLY default).
    try {
      await send(visitorWs, server, { type: "ADD_SHAPE", shape: makeShape("intruder") });
    } catch {
      /* expected — dispatcher swallows the requireCanMutate throw */
    }
    expect(room.getShapes()).toHaveLength(1);

    // 8. Admin hits play. The audio-load gate broadcasts LOAD_AUDIO_SOURCE with contextId=s1.
    broadcasts = [];
    await send(adminWs, server, {
      type: "PLAY",
      contextId: "s1",
      audioSource: TRACK_URL,
      trackTimeSeconds: 0,
    });

    const loadEvents = broadcasts.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "LOAD_AUDIO_SOURCE"
    );
    expect(loadEvents).toHaveLength(1);
    const loadEv = loadEvents[0].message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
    if (loadEv.event.type !== "LOAD_AUDIO_SOURCE") throw new Error("unreachable");
    expect(loadEv.event.contextId).toBe("s1");

    // 9. Both clients confirm load — second one triggers SCHEDULED_ACTION.
    await send(adminWs, server, {
      type: "AUDIO_SOURCE_LOADED",
      source: { url: TRACK_URL },
      contextId: "s1",
    });
    expect(broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION")).toHaveLength(0);

    await send(visitorWs, server, {
      type: "AUDIO_SOURCE_LOADED",
      source: { url: TRACK_URL },
      contextId: "s1",
    });
    const scheduled = broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    expect(sa.scheduledAction.contextId).toBe("s1");
    expect(room.getPlaylist("s1")?.playback.type).toBe("playing");

    // 10. Admin pauses.
    broadcasts = [];
    await send(adminWs, server, {
      type: "PAUSE",
      contextId: "s1",
      audioSource: TRACK_URL,
      trackTimeSeconds: 7.5,
    });
    const pauseScheduled = broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(pauseScheduled).toHaveLength(1);
    const pa = pauseScheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (pa.scheduledAction.type !== "PAUSE") throw new Error("unreachable");
    expect(pa.scheduledAction.contextId).toBe("s1");
    expect(room.getPlaylist("s1")?.playback.type).toBe("paused");
  });

  it("late visitor receives ROOM_TYPE_INFO + SHAPES_UPDATE + per-context resume", () => {
    const server = createMockServer();
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    room.addShape(makeShape("s1"));
    room.addTrackToContext("s1", { url: TRACK_URL });
    // Pretend playback started 3 seconds ago at position 2.5s
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", contextId: "s1", audioSource: TRACK_URL, trackTimeSeconds: 2.5 },
      Date.now() - 3000
    );

    const visitorWs = createMockWs({ clientId: "late-visitor", roomId: ROOM_ID });
    handleOpen(visitorWs, server);

    const sentMessages = (visitorWs.send as ReturnType<typeof mock>).mock.calls.map(
      (c: unknown[]) => JSON.parse(c[0] as string) as WSBroadcastType
    );

    const findRoomEvent = <E extends string>(ty: E) =>
      sentMessages.find(
        (m): m is Extract<WSBroadcastType, { type: "ROOM_EVENT" }> => m.type === "ROOM_EVENT" && m.event.type === ty
      );

    expect(findRoomEvent("ROOM_TYPE_INFO")).toBeTruthy();
    const shapesUpdate = findRoomEvent("SHAPES_UPDATE");
    if (shapesUpdate?.event.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(shapesUpdate.event.shapes).toHaveLength(1);

    const resumePlay = sentMessages.find(
      (m): m is Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }> =>
        m.type === "SCHEDULED_ACTION" && m.scheduledAction.type === "PLAY" && m.scheduledAction.contextId === "s1"
    );
    if (resumePlay?.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    expect(resumePlay.scheduledAction.trackTimeSeconds).toBeGreaterThan(2.5);
  });

  it("jam mode: SET_PLAYBACK_CONTROLS=EVERYONE lets visitors draw shapes", async () => {
    const server = createMockServer();
    const adminWs = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    adminWs.data.requestedRoomType = "map";
    handleOpen(adminWs, server);

    const visitorWs = createMockWs({ clientId: "visitor", roomId: ROOM_ID });
    handleOpen(visitorWs, server);

    await send(adminWs, server, {
      type: "SET_PLAYBACK_CONTROLS",
      permissions: "EVERYONE",
    });

    await send(visitorWs, server, { type: "ADD_SHAPE", shape: makeShape("jam-shape") });
    expect(globalManager.getRoom(ROOM_ID)?.getShape("jam-shape")).toBeTruthy();
  });
});
