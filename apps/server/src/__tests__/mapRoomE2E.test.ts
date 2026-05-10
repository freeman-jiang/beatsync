// End-to-end map-room flow test. Simulates the full lifecycle a curator + visitor
// would drive: create a map room → admin draws shapes → admin uploads audio →
// admin starts playback → second client loads in mid-play → admin pauses.
//
// Drives the WS dispatcher (not direct handler calls) so the test exercises the
// real Zod validation + registry routing alongside the handlers.

import type { WSBroadcastType, WSRequestType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

let broadcasts: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];
let unicasts: WSBroadcastType[] = [];

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
    unicasts.push(message);
    ws.send(JSON.stringify(message));
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

import { handleOpen } from "@/routes/websocketHandlers";
import { dispatchMessage } from "@/websocket/dispatch";

const ROOM_ID = "e2e-map-room";
const TRACK_URL = "https://example.com/audio.mp3";

function send(ws: ReturnType<typeof createMockWs>, server: BunServer, message: WSRequestType) {
  // Drive the dispatcher synchronously by awaiting the returned promise outside.
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
    createdBy: "admin-c1",
    createdAt: Date.now(),
    loop: true,
    groupId: null,
    audibleRadiusMeters: 50,
  };
}

beforeEach(() => {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
  broadcasts = [];
  unicasts = [];
});

describe("map room E2E", () => {
  it("supports the full curator workflow with a synchronized start", async () => {
    const server = createMockServer();

    // 1. Admin connects requesting roomType=map
    const adminWs = createMockWs({ clientId: "admin-c1", roomId: ROOM_ID });
    adminWs.data.requestedRoomType = "map";
    handleOpen(adminWs, server);

    const room = globalManager.getRoom(ROOM_ID)!;
    expect(room.getRoomType()).toBe("map");
    expect(room.getClient("admin-c1")?.isAdmin).toBe(true);

    // 2. Admin sets the map center
    await send(adminWs, server, {
      type: "SET_MAP_METADATA",
      metadata: { center: [42.28, -83.74], zoom: 17 },
    });
    expect(room.getMapMetadata()).toEqual({ center: [42.28, -83.74], zoom: 17 });

    // 3. Admin draws a shape
    await send(adminWs, server, { type: "ADD_SHAPE", shape: makeShape("s1") });
    expect(room.getShapeStates()).toHaveLength(1);

    // 4. Admin adds an audio source to the shape
    await send(adminWs, server, {
      type: "ADD_SHAPE_AUDIO_SOURCE",
      shapeId: "s1",
      source: { url: TRACK_URL },
    });
    expect(room.getShape("s1")?.playlist).toEqual([{ url: TRACK_URL }]);

    // 5. Visitor joins (a second client) — they should get ROOM_TYPE_INFO + SHAPES_UPDATE
    const visitorWs = createMockWs({ clientId: "visitor-c2", roomId: ROOM_ID });
    handleOpen(visitorWs, server);
    expect(room.getClient("visitor-c2")?.isAdmin).toBe(false);

    // 6. Visitor reports their GPS position — should not require admin
    await send(visitorWs, server, { type: "SET_GEO_POSITION", lat: 42.2801, lng: -83.7401 });
    expect(room.getClient("visitor-c2")?.geoPosition).toEqual({ lat: 42.2801, lng: -83.7401 });

    // 7. Visitor tries to draw a shape — should be rejected (ADMIN_ONLY default).
    // The dispatcher catches the throw internally; the side-effect we care about
    // is that the room's shape count didn't change.
    try {
      await send(visitorWs, server, { type: "ADD_SHAPE", shape: makeShape("intruder") });
    } catch {
      /* expected — dispatcher swallows the requireCanMutate throw */
    }
    expect(room.getShapeStates()).toHaveLength(1);

    // 8. Admin hits play for shape s1
    broadcasts = [];
    await send(adminWs, server, {
      type: "PLAY",
      shapeId: "s1",
      audioSource: TRACK_URL,
      trackTimeSeconds: 0,
    });

    // 9. LOAD_AUDIO_SOURCE should be broadcast with the shapeId scope
    const loadEvents = broadcasts.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "LOAD_AUDIO_SOURCE"
    );
    expect(loadEvents).toHaveLength(1);
    const loadEv = loadEvents[0].message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
    if (loadEv.event.type !== "LOAD_AUDIO_SOURCE") throw new Error("unreachable");
    expect(loadEv.event.shapeId).toBe("s1");
    expect(loadEv.event.audioSourceToPlay.url).toBe(TRACK_URL);

    // 10. Both clients report AUDIO_SOURCE_LOADED — second one triggers SCHEDULED_ACTION
    await send(adminWs, server, {
      type: "AUDIO_SOURCE_LOADED",
      source: { url: TRACK_URL },
      shapeId: "s1",
    });
    expect(broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION")).toHaveLength(0);

    await send(visitorWs, server, {
      type: "AUDIO_SOURCE_LOADED",
      source: { url: TRACK_URL },
      shapeId: "s1",
    });
    const scheduled = broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    expect(sa.scheduledAction.shapeId).toBe("s1");
    expect(sa.serverTimeToExecute).toBeGreaterThan(Date.now() - 100);
    expect(room.getShape("s1")?.playback.type).toBe("playing");

    // 11. Admin pauses
    broadcasts = [];
    await send(adminWs, server, {
      type: "PAUSE",
      shapeId: "s1",
      audioSource: TRACK_URL,
      trackTimeSeconds: 7.5,
    });
    const pauseSched = broadcasts.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(pauseSched).toHaveLength(1);
    const pa = pauseSched[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (pa.scheduledAction.type !== "PAUSE") throw new Error("unreachable");
    expect(pa.scheduledAction.shapeId).toBe("s1");
    expect(pa.scheduledAction.trackTimeSeconds).toBe(7.5);
    expect(room.getShape("s1")?.playback.type).toBe("paused");
  });

  it("late-joining visitor receives shape state and resumes a playing shape", () => {
    const server = createMockServer();
    const room = globalManager.getOrCreateRoom(ROOM_ID);
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: TRACK_URL });
    // Pretend playback started 3 seconds ago at track position 2.5s
    room.updateShapePlaybackPlay(
      "s1",
      { type: "PLAY", shapeId: "s1", audioSource: TRACK_URL, trackTimeSeconds: 2.5 },
      Date.now() - 3000
    );

    // Visitor connects fresh
    const visitorWs = createMockWs({ clientId: "late-visitor", roomId: ROOM_ID });
    handleOpen(visitorWs, server);

    const sentMessages = (visitorWs.send as ReturnType<typeof mock>).mock.calls.map(
      (c: unknown[]) => JSON.parse(c[0] as string) as WSBroadcastType
    );

    const roomType = sentMessages.find(
      (m): m is Extract<WSBroadcastType, { type: "ROOM_EVENT" }> =>
        m.type === "ROOM_EVENT" && m.event.type === "ROOM_TYPE_INFO"
    );
    expect(roomType).toBeTruthy();

    const shapesUpdate = sentMessages.find(
      (m): m is Extract<WSBroadcastType, { type: "ROOM_EVENT" }> =>
        m.type === "ROOM_EVENT" && m.event.type === "SHAPES_UPDATE"
    );
    expect(shapesUpdate).toBeTruthy();
    if (shapesUpdate?.event.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(shapesUpdate.event.shapes).toHaveLength(1);

    const resumePlay = sentMessages.find(
      (m): m is Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }> =>
        m.type === "SCHEDULED_ACTION" && m.scheduledAction.type === "PLAY" && m.scheduledAction.shapeId === "s1"
    );
    expect(resumePlay).toBeTruthy();
    if (resumePlay?.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    expect(resumePlay.scheduledAction.trackTimeSeconds).toBeGreaterThan(2.5);
  });

  it("flipping playbackControlsPermissions to EVERYONE lets visitors draw shapes (jam mode)", async () => {
    const server = createMockServer();

    const adminWs = createMockWs({ clientId: "admin", roomId: ROOM_ID });
    adminWs.data.requestedRoomType = "map";
    handleOpen(adminWs, server);

    const visitorWs = createMockWs({ clientId: "visitor", roomId: ROOM_ID });
    handleOpen(visitorWs, server);

    // Switch to EVERYONE (jam mode)
    await send(adminWs, server, {
      type: "SET_PLAYBACK_CONTROLS",
      permissions: "EVERYONE",
    });

    await send(visitorWs, server, { type: "ADD_SHAPE", shape: makeShape("jam-shape") });
    expect(globalManager.getRoom(ROOM_ID)?.getShape("jam-shape")).toBeTruthy();
  });
});
