// Tests for the map-room WS handlers. Asserts that:
//  - admin-only mutations are gated by requireCanMutate
//  - mutations only fire when the room is actually a map room
//  - every mutation broadcasts a SHAPES_UPDATE (or MAP_METADATA_UPDATE) snapshot
//  - PLAY/PAUSE/AUDIO_SOURCE_LOADED route to the shape-scoped methods when shapeId is set
//  - participation actions (geo position, visibility) are allowed for non-admins

import type { ShapeType, WSBroadcastType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
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

// Imports below this point reference the mocked sendBroadcast.
import {
  handleAddShape,
  handleAddShapeAudioSource,
  handleClearShapes,
  handleDeleteShape,
  handleRemoveShapeAudioSources,
  handleReorderShapePlaylist,
  handleSetGeoPosition,
  handleSetMapMetadata,
  handleSetShapeAudibleRadius,
  handleSetShapeGroup,
  handleSetShapeLoop,
  handleSetVisibility,
  handleUpdateShape,
} from "@/websocket/handlers/mapHandlers";
import { handlePause } from "@/websocket/handlers/pause";
import { handlePlay } from "@/websocket/handlers/play";
import { handleAudioSourceLoaded } from "@/websocket/handlers/handleAudioSourceLoaded";

function makeShape(id: string, overrides: Partial<ShapeType> = {}): ShapeType {
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
    createdBy: "creator-client",
    createdAt: Date.now(),
    loop: true,
    groupId: null,
    audibleRadiusMeters: 50,
    ...overrides,
  };
}

function freshMapRoom(roomId = "map-handlers-test") {
  // Wipe any stale state from prior tests.
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);

  const room = globalManager.getOrCreateRoom(roomId);
  room.setRoomType("map");

  // First client joining a non-demo room becomes admin automatically.
  const adminWs = createMockWs({ clientId: "admin-1", roomId });
  room.addClient(adminWs);

  return { room, adminWs, server: createMockServer() };
}

function lastShapesUpdate() {
  const last = [...broadcastMessages]
    .reverse()
    .find((b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "SHAPES_UPDATE");
  if (!last) throw new Error("expected SHAPES_UPDATE broadcast");
  const e = last.message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
  if (e.event.type !== "SHAPES_UPDATE") throw new Error("not SHAPES_UPDATE");
  return e.event;
}

beforeEach(() => {
  broadcastMessages = [];
});

describe("handleAddShape", () => {
  it("adds a shape and broadcasts SHAPES_UPDATE", () => {
    const { adminWs, server } = freshMapRoom();
    const shape = makeShape("s1");

    void handleAddShape({ ws: adminWs, message: { type: "ADD_SHAPE", shape }, server });

    const update = lastShapesUpdate();
    expect(update.shapes).toHaveLength(1);
    expect(update.shapes[0].shape.id).toBe("s1");
    expect(update.shapes[0].playlist).toEqual([]);
  });

  it("throws (no broadcast) when a non-admin tries while ADMIN_ONLY", () => {
    const { room, server } = freshMapRoom();
    const visitorWs = createMockWs({ clientId: "visitor-1", roomId: room.getRoomId() });
    room.addClient(visitorWs);

    expect(() =>
      handleAddShape({
        ws: visitorWs,
        message: { type: "ADD_SHAPE", shape: makeShape("s1") },
        server,
      })
    ).toThrow(/permission/);
    const shapesUpdates = broadcastMessages.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "SHAPES_UPDATE"
    );
    expect(shapesUpdates).toHaveLength(0);
  });

  it("ignores ADD_SHAPE in audio rooms", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("audio-room");
    const ws = createMockWs({ clientId: "c1", roomId: "audio-room" });
    room.addClient(ws);

    void handleAddShape({
      ws,
      message: { type: "ADD_SHAPE", shape: makeShape("s1") },
      server: createMockServer(),
    });

    const shapesUpdates = broadcastMessages.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "SHAPES_UPDATE"
    );
    expect(shapesUpdates).toHaveLength(0);
    expect(room.getShapeStates()).toEqual([]);
  });
});

describe("handleUpdateShape & handleDeleteShape & handleClearShapes", () => {
  it("updateShape replaces geometry and broadcasts", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcastMessages = [];

    void handleUpdateShape({
      ws: adminWs,
      message: { type: "UPDATE_SHAPE", shapeId: "s1", coordinates: [[[9, 9]]] },
      server,
    });

    const update = lastShapesUpdate();
    expect(update.shapes[0].shape.coordinates).toEqual([[[9, 9]]]);
  });

  it("deleteShape removes and broadcasts", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcastMessages = [];

    void handleDeleteShape({ ws: adminWs, message: { type: "DELETE_SHAPE", shapeId: "s1" }, server });
    expect(lastShapesUpdate().shapes).toEqual([]);
  });

  it("clearShapes empties and broadcasts", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    broadcastMessages = [];

    void handleClearShapes({ ws: adminWs, message: { type: "CLEAR_SHAPES" }, server });
    expect(lastShapesUpdate().shapes).toEqual([]);
  });
});

describe("shape playlist handlers", () => {
  it("ADD_SHAPE_AUDIO_SOURCE appends and broadcasts", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcastMessages = [];

    void handleAddShapeAudioSource({
      ws: adminWs,
      message: { type: "ADD_SHAPE_AUDIO_SOURCE", shapeId: "s1", source: { url: "a.mp3" } },
      server,
    });

    expect(lastShapesUpdate().shapes[0].playlist).toEqual([{ url: "a.mp3" }]);
  });

  it("REMOVE_SHAPE_AUDIO_SOURCES drops by URL", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    broadcastMessages = [];

    void handleRemoveShapeAudioSources({
      ws: adminWs,
      message: { type: "REMOVE_SHAPE_AUDIO_SOURCES", shapeId: "s1", urls: ["a.mp3"] },
      server,
    });

    expect(lastShapesUpdate().shapes[0].playlist).toEqual([{ url: "b.mp3" }]);
  });

  it("REORDER_SHAPE_PLAYLIST changes order", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    broadcastMessages = [];

    void handleReorderShapePlaylist({
      ws: adminWs,
      message: {
        type: "REORDER_SHAPE_PLAYLIST",
        shapeId: "s1",
        reorderedAudioSources: [{ url: "b.mp3" }, { url: "a.mp3" }],
      },
      server,
    });

    const playlist = lastShapesUpdate().shapes[0].playlist;
    expect(playlist[0].url).toBe("b.mp3");
  });
});

describe("shape behavior handlers", () => {
  it("SET_SHAPE_LOOP / SET_SHAPE_GROUP / SET_SHAPE_AUDIBLE_RADIUS each broadcast", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcastMessages = [];

    void handleSetShapeLoop({
      ws: adminWs,
      message: { type: "SET_SHAPE_LOOP", shapeId: "s1", loop: false },
      server,
    });
    expect(lastShapesUpdate().shapes[0].shape.loop).toBe(false);

    void handleSetShapeGroup({
      ws: adminWs,
      message: { type: "SET_SHAPE_GROUP", shapeId: "s1", groupId: "g1" },
      server,
    });
    expect(lastShapesUpdate().shapes[0].shape.groupId).toBe("g1");

    void handleSetShapeAudibleRadius({
      ws: adminWs,
      message: { type: "SET_SHAPE_AUDIBLE_RADIUS", shapeId: "s1", audibleRadiusMeters: 300 },
      server,
    });
    expect(lastShapesUpdate().shapes[0].shape.audibleRadiusMeters).toBe(300);
  });
});

describe("handleSetMapMetadata", () => {
  it("broadcasts MAP_METADATA_UPDATE and updates room state", () => {
    const { room, adminWs, server } = freshMapRoom();

    void handleSetMapMetadata({
      ws: adminWs,
      message: { type: "SET_MAP_METADATA", metadata: { center: [10, 20], zoom: 15 } },
      server,
    });

    const updates = broadcastMessages.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "MAP_METADATA_UPDATE"
    );
    expect(updates).toHaveLength(1);
    expect(room.getMapMetadata()).toEqual({ center: [10, 20], zoom: 15 });
  });
});

describe("participation handlers", () => {
  it("SET_GEO_POSITION updates client state without requiring admin", () => {
    const { room, server } = freshMapRoom();
    const visitorWs = createMockWs({ clientId: "v1", roomId: room.getRoomId() });
    room.addClient(visitorWs);

    void handleSetGeoPosition({
      ws: visitorWs,
      message: { type: "SET_GEO_POSITION", lat: 42.28, lng: -83.74 },
      server,
    });

    expect(room.getClient("v1")!.geoPosition).toEqual({ lat: 42.28, lng: -83.74 });
  });

  it("SET_VISIBILITY flips the hidden flag in audio rooms too", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("audio-vis");
    const ws = createMockWs({ clientId: "c1", roomId: "audio-vis" });
    room.addClient(ws);

    void handleSetVisibility({
      ws,
      message: { type: "SET_VISIBILITY", isHidden: true },
      server: createMockServer(),
    });

    expect(room.getClient("c1")!.isHidden).toBe(true);
  });

  it("SET_GEO_POSITION is ignored in audio rooms", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("audio-geo");
    const ws = createMockWs({ clientId: "c1", roomId: "audio-geo" });
    room.addClient(ws);

    void handleSetGeoPosition({
      ws,
      message: { type: "SET_GEO_POSITION", lat: 42.28, lng: -83.74 },
      server: createMockServer(),
    });

    // Audio rooms shouldn't accept geo positions
    expect(room.getClient("c1")!.geoPosition).toBeUndefined();
  });
});

describe("PLAY / PAUSE / AUDIO_SOURCE_LOADED routing", () => {
  it("PLAY with shapeId initiates per-shape load and broadcasts LOAD_AUDIO_SOURCE", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    broadcastMessages = [];

    void handlePlay({
      ws: adminWs,
      message: { type: "PLAY", shapeId: "s1", audioSource: "track-1.mp3", trackTimeSeconds: 0 },
      server,
    });

    const loadEvents = broadcastMessages.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "LOAD_AUDIO_SOURCE"
    );
    expect(loadEvents).toHaveLength(1);
    const ev = loadEvents[0].message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
    if (ev.event.type !== "LOAD_AUDIO_SOURCE") throw new Error("unreachable");
    expect(ev.event.shapeId).toBe("s1");
  });

  it("AUDIO_SOURCE_LOADED with shapeId completes per-shape pending play", () => {
    const { room, adminWs, server } = freshMapRoom();
    const otherWs = createMockWs({ clientId: "c2", roomId: room.getRoomId() });
    room.addClient(otherWs);
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });

    void handlePlay({
      ws: adminWs,
      message: { type: "PLAY", shapeId: "s1", audioSource: "track-1.mp3", trackTimeSeconds: 0 },
      server,
    });
    broadcastMessages = []; // drop the LOAD event

    // The initiator is NOT pre-counted; admin must report loaded too. Until both have
    // reported, the schedule should not fire.
    void handleAudioSourceLoaded({
      ws: otherWs,
      message: { type: "AUDIO_SOURCE_LOADED", source: { url: "track-1.mp3" }, shapeId: "s1" },
      server,
    });
    expect(broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION")).toHaveLength(0);

    void handleAudioSourceLoaded({
      ws: adminWs,
      message: { type: "AUDIO_SOURCE_LOADED", source: { url: "track-1.mp3" }, shapeId: "s1" },
      server,
    });

    const scheduled = broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PLAY") throw new Error("unreachable");
    expect(sa.scheduledAction.shapeId).toBe("s1");
    expect(room.getShape("s1")!.playback.type).toBe("playing");
  });

  it("PAUSE with shapeId emits a shape-scoped pause", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    room.updateShapePlaybackPlay(
      "s1",
      { type: "PLAY", shapeId: "s1", audioSource: "track-1.mp3", trackTimeSeconds: 0 },
      1
    );
    broadcastMessages = [];

    void handlePause({
      ws: adminWs,
      message: { type: "PAUSE", shapeId: "s1", audioSource: "track-1.mp3", trackTimeSeconds: 4 },
      server,
    });

    const scheduled = broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PAUSE") throw new Error("unreachable");
    expect(sa.scheduledAction.shapeId).toBe("s1");
    expect(room.getShape("s1")!.playback.type).toBe("paused");
  });
});
