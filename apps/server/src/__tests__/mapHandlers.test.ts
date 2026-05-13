// Tests for the map-room WS handlers + the auto-playlist-context behavior
// (every ADD_SHAPE creates a matching playlist context; DELETE_SHAPE removes it).
// Also covers permission gating, room-type gating, and the per-context track
// add/remove handlers.

import type { ShapeType, WSBroadcastType } from "@beatsync/shared";
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
  sendUnicast: mock(() => {
    /* noop */
  }),
  sendToClient: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

import {
  handleAddShape,
  handleClearShapes,
  handleDeleteShape,
  handleSetGeoPosition,
  handleSetMapMetadata,
  handleSetShapeFalloff,
  handleSetShapeGroup,
  handleSetVisibility,
  handleUpdateShape,
} from "@/websocket/handlers/mapHandlers";
import { handleAddTrackToContext, handleRemoveTrackFromContext } from "@/websocket/handlers/contextTracks";

const ROOM_ID = "map-handlers-test";

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
    createdBy: "creator",
    createdAt: Date.now(),
    groupId: null,
    falloffMeters: 25,
    ...overrides,
  };
}

function freshMapRoom() {
  for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
  const room = globalManager.getOrCreateRoom(ROOM_ID);
  room.setRoomType("map");
  // First connection in non-demo rooms auto-promotes to admin.
  const adminWs = createMockWs({ clientId: "admin-1", roomId: ROOM_ID });
  room.addClient(adminWs);
  return { room, adminWs, server: createMockServer() };
}

function lastEventOfType<E extends string>(eventType: E) {
  const found = [...broadcasts]
    .reverse()
    .find((b) => b.message.type === "ROOM_EVENT" && b.message.event.type === eventType);
  if (!found) throw new Error(`expected a ${eventType} broadcast`);
  const ev = found.message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
  return ev.event;
}

beforeEach(() => {
  broadcasts = [];
});

describe("handleAddShape", () => {
  it("adds geometry, auto-creates the playlist context, and broadcasts both", () => {
    const { adminWs, server } = freshMapRoom();
    void handleAddShape({
      ws: adminWs,
      message: { type: "ADD_SHAPE", shape: makeShape("s1") },
      server,
    });

    const shapes = lastEventOfType("SHAPES_UPDATE");
    if (shapes.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(shapes.shapes).toHaveLength(1);
    expect(shapes.shapes[0].id).toBe("s1");

    // The playlist snapshot includes the new context (id=s1) alongside "main".
    const playlists = lastEventOfType("PLAYLISTS_UPDATE");
    if (playlists.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    const ids = playlists.playlists.map((p) => p.id).sort();
    expect(ids).toEqual(["main", "s1"]);
    expect(playlists.playlists.find((p) => p.id === "s1")?.loop).toBe(true);
  });

  it("rejects when the room isn't a map room (audio rooms ignore shape mutations)", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("audio-room");
    const ws = createMockWs({ clientId: "c1", roomId: "audio-room" });
    room.addClient(ws);

    void handleAddShape({
      ws,
      message: { type: "ADD_SHAPE", shape: makeShape("s1") },
      server: createMockServer(),
    });

    expect(broadcasts).toHaveLength(0);
    expect(room.getShapes()).toEqual([]);
  });

  it("rejects non-admin in ADMIN_ONLY rooms with no broadcast", () => {
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
    expect(broadcasts).toHaveLength(0);
  });
});

describe("handleUpdateShape / handleDeleteShape / handleClearShapes", () => {
  it("updateShape changes coordinates and broadcasts SHAPES_UPDATE", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcasts = [];
    void handleUpdateShape({
      ws: adminWs,
      message: { type: "UPDATE_SHAPE", shapeId: "s1", coordinates: [[[9, 9]]] },
      server,
    });
    const ev = lastEventOfType("SHAPES_UPDATE");
    if (ev.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(ev.shapes[0].coordinates).toEqual([[[9, 9]]]);
  });

  it("deleteShape removes shape + playlist context, broadcasting both events", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcasts = [];
    void handleDeleteShape({
      ws: adminWs,
      message: { type: "DELETE_SHAPE", shapeId: "s1" },
      server,
    });
    const shapesEv = lastEventOfType("SHAPES_UPDATE");
    if (shapesEv.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(shapesEv.shapes).toEqual([]);

    const playlistsEv = lastEventOfType("PLAYLISTS_UPDATE");
    if (playlistsEv.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    expect(playlistsEv.playlists.map((p) => p.id)).toEqual(["main"]);
  });

  it("clearShapes wipes shapes + their playlist contexts", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    broadcasts = [];
    void handleClearShapes({ ws: adminWs, message: { type: "CLEAR_SHAPES" }, server });

    const shapesEv = lastEventOfType("SHAPES_UPDATE");
    if (shapesEv.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(shapesEv.shapes).toEqual([]);
    const playlistsEv = lastEventOfType("PLAYLISTS_UPDATE");
    if (playlistsEv.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    expect(playlistsEv.playlists.map((p) => p.id)).toEqual(["main"]);
  });
});

describe("handleSetShapeFalloff / handleSetShapeGroup", () => {
  it("updates the field and broadcasts SHAPES_UPDATE", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcasts = [];
    void handleSetShapeFalloff({
      ws: adminWs,
      message: { type: "SET_SHAPE_FALLOFF", shapeId: "s1", falloffMeters: 120 },
      server,
    });
    let ev = lastEventOfType("SHAPES_UPDATE");
    if (ev.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(ev.shapes[0].falloffMeters).toBe(120);

    void handleSetShapeGroup({
      ws: adminWs,
      message: { type: "SET_SHAPE_GROUP", shapeId: "s1", groupId: "g42" },
      server,
    });
    ev = lastEventOfType("SHAPES_UPDATE");
    if (ev.type !== "SHAPES_UPDATE") throw new Error("unreachable");
    expect(ev.shapes[0].groupId).toBe("g42");
  });
});

describe("handleSetMapMetadata", () => {
  it("updates state and broadcasts MAP_METADATA_UPDATE", () => {
    const { room, adminWs, server } = freshMapRoom();
    void handleSetMapMetadata({
      ws: adminWs,
      message: { type: "SET_MAP_METADATA", metadata: { center: [10, 20], zoom: 15 } },
      server,
    });
    const ev = lastEventOfType("MAP_METADATA_UPDATE");
    if (ev.type !== "MAP_METADATA_UPDATE") throw new Error("unreachable");
    expect(ev.metadata).toEqual({ center: [10, 20], zoom: 15 });
    expect(room.getMapMetadata()).toEqual({ center: [10, 20], zoom: 15 });
  });
});

describe("handleSetGeoPosition / handleSetVisibility (participation, not curation)", () => {
  it("SET_GEO_POSITION mutates client state without requiring admin", () => {
    const { room, server } = freshMapRoom();
    const visitorWs = createMockWs({ clientId: "v1", roomId: room.getRoomId() });
    room.addClient(visitorWs);
    void handleSetGeoPosition({
      ws: visitorWs,
      message: { type: "SET_GEO_POSITION", lat: 42.28, lng: -83.74 },
      server,
    });
    expect(room.getClient("v1")?.geoPosition).toEqual({ lat: 42.28, lng: -83.74 });
  });

  it("SET_GEO_POSITION is ignored in audio rooms (room.isMapRoom() false)", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("audio-geo");
    const ws = createMockWs({ clientId: "c1", roomId: "audio-geo" });
    room.addClient(ws);
    void handleSetGeoPosition({
      ws,
      message: { type: "SET_GEO_POSITION", lat: 1, lng: 2 },
      server: createMockServer(),
    });
    expect(room.getClient("c1")?.geoPosition).toBeUndefined();
  });

  it("SET_VISIBILITY works regardless of room type", () => {
    for (const id of globalManager.getRoomIds()) globalManager.deleteRoom(id);
    const room = globalManager.getOrCreateRoom("vis-test");
    const ws = createMockWs({ clientId: "c1", roomId: "vis-test" });
    room.addClient(ws);
    void handleSetVisibility({
      ws,
      message: { type: "SET_VISIBILITY", isHidden: true },
      server: createMockServer(),
    });
    expect(room.getClient("c1")?.isHidden).toBe(true);
  });
});

describe("contextTracks handlers", () => {
  it("ADD_TRACK_TO_CONTEXT appends a track and broadcasts PLAYLISTS_UPDATE", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    broadcasts = [];
    void handleAddTrackToContext({
      ws: adminWs,
      message: { type: "ADD_TRACK_TO_CONTEXT", contextId: "s1", source: { url: "a.mp3" } },
      server,
    });
    const ev = lastEventOfType("PLAYLISTS_UPDATE");
    if (ev.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    expect(ev.playlists.find((p) => p.id === "s1")?.tracks).toEqual([{ url: "a.mp3" }]);
  });

  it("REMOVE_TRACK_FROM_CONTEXT removes a track and broadcasts PLAYLISTS_UPDATE", () => {
    const { room, adminWs, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    room.addTrackToContext("s1", { url: "a.mp3" });
    room.addTrackToContext("s1", { url: "b.mp3" });
    broadcasts = [];
    void handleRemoveTrackFromContext({
      ws: adminWs,
      message: { type: "REMOVE_TRACK_FROM_CONTEXT", contextId: "s1", url: "a.mp3" },
      server,
    });
    const ev = lastEventOfType("PLAYLISTS_UPDATE");
    if (ev.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    expect(ev.playlists.find((p) => p.id === "s1")?.tracks).toEqual([{ url: "b.mp3" }]);
  });

  it("ADD_TRACK_TO_CONTEXT with missing contextId routes to 'main'", () => {
    const { adminWs, server } = freshMapRoom();
    broadcasts = [];
    void handleAddTrackToContext({
      ws: adminWs,
      message: { type: "ADD_TRACK_TO_CONTEXT", source: { url: "main-track.mp3" } },
      server,
    });
    const ev = lastEventOfType("PLAYLISTS_UPDATE");
    if (ev.type !== "PLAYLISTS_UPDATE") throw new Error("unreachable");
    expect(ev.playlists.find((p) => p.id === "main")?.tracks).toEqual([{ url: "main-track.mp3" }]);
  });

  it("non-admin can't add/remove tracks in ADMIN_ONLY rooms", () => {
    const { room, server } = freshMapRoom();
    room.addShape(makeShape("s1"));
    const visitor = createMockWs({ clientId: "visitor", roomId: room.getRoomId() });
    room.addClient(visitor);
    broadcasts = [];
    expect(() =>
      handleAddTrackToContext({
        ws: visitor,
        message: { type: "ADD_TRACK_TO_CONTEXT", contextId: "s1", source: { url: "x.mp3" } },
        server,
      })
    ).toThrow(/permission/);
    expect(broadcasts).toHaveLength(0);
  });
});
