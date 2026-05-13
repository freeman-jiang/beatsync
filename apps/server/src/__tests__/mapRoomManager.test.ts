// Tests for RoomManager's map-room methods (shape geometry, room type, map
// metadata, client presence) plus the auto-playlist-context behavior — every
// shape creates a matching playlist context with id == shape.id.

import type { ShapeType } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { RoomManager } from "@/managers/RoomManager";

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(() => {
    /* noop */
  }),
  sendUnicast: mock(() => {
    /* noop */
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "map-mgr-test";

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
    groupId: null,
    falloffMeters: 25,
    ...overrides,
  };
}

describe("RoomManager: room type", () => {
  it("defaults to audio rooms for back-compat", () => {
    const room = new RoomManager(ROOM_ID);
    expect(room.getRoomType()).toBe("audio");
    expect(room.isMapRoom()).toBe(false);
  });

  it("can be set to map before any clients join", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    expect(room.getRoomType()).toBe("map");
    expect(room.isMapRoom()).toBe(true);
  });

  it("is idempotent for same-value sets", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    expect(() => room.setRoomType("map")).not.toThrow();
  });

  it("refuses to change type once a client has joined", () => {
    const room = new RoomManager(ROOM_ID);
    room.addClient(createMockWs({ clientId: "c1" }));
    expect(() => room.setRoomType("map")).toThrow(/already has clients/);
  });
});

describe("RoomManager: shape CRUD", () => {
  let room: RoomManager;
  beforeEach(() => {
    room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
  });

  it("starts with no shapes", () => {
    expect(room.getShapes()).toEqual([]);
  });

  it("addShape returns true on first add and false on duplicate", () => {
    expect(room.addShape(makeShape("s1"))).toBe(true);
    expect(room.addShape(makeShape("s1"))).toBe(false);
  });

  it("addShape auto-creates a matching playlist context with loop=true", () => {
    room.addShape(makeShape("s1"));
    const playlists = room.getPlaylistsView();
    const ctx = playlists.find((p) => p.id === "s1");
    expect(ctx).toBeDefined();
    expect(ctx?.loop).toBe(true);
    expect(ctx?.tracks).toEqual([]);
  });

  it("updateShapeCoordinates replaces only the geometry", () => {
    room.addShape(makeShape("s1"));
    const newCoords = [
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    ];
    expect(room.updateShapeCoordinates("s1", newCoords)).toBe(true);
    expect(room.getShape("s1")?.coordinates).toEqual(newCoords);
    // Falloff / group unchanged
    expect(room.getShape("s1")?.falloffMeters).toBe(25);
  });

  it("updateShapeCoordinates on missing shape returns false", () => {
    expect(room.updateShapeCoordinates("missing", [])).toBe(false);
  });

  it("deleteShape removes the shape AND its playlist context", () => {
    room.addShape(makeShape("s1"));
    expect(room.getPlaylist("s1")).toBeDefined();
    expect(room.deleteShape("s1")).toBe(true);
    expect(room.getShape("s1")).toBeUndefined();
    expect(room.getPlaylist("s1")).toBeUndefined();
  });

  it("clearShapes removes every shape and its matching playlist", () => {
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    room.clearShapes();
    expect(room.getShapes()).toEqual([]);
    expect(room.getPlaylist("s1")).toBeUndefined();
    expect(room.getPlaylist("s2")).toBeUndefined();
    // The main context is preserved.
    expect(room.getPlaylist("main")).toBeDefined();
  });

  it("setShapeFalloff mutates only falloffMeters", () => {
    room.addShape(makeShape("s1"));
    expect(room.setShapeFalloff("s1", 100)).toBe(true);
    expect(room.getShape("s1")?.falloffMeters).toBe(100);
  });

  it("setShapeGroup mutates only groupId", () => {
    room.addShape(makeShape("s1"));
    expect(room.setShapeGroup("s1", "group-a")).toBe(true);
    expect(room.getShape("s1")?.groupId).toBe("group-a");
  });
});

describe("RoomManager: per-context tracks", () => {
  let room: RoomManager;
  beforeEach(() => {
    room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
  });

  it("addTrackToContext appends a track to the shape's playlist", () => {
    const tracks = room.addTrackToContext("s1", { url: "a.mp3" });
    expect(tracks).toEqual([{ url: "a.mp3" }]);
    const more = room.addTrackToContext("s1", { url: "b.mp3" });
    expect(more).toEqual([{ url: "a.mp3" }, { url: "b.mp3" }]);
  });

  it("addTrackToContext de-duplicates by URL", () => {
    room.addTrackToContext("s1", { url: "a.mp3" });
    const tracks = room.addTrackToContext("s1", { url: "a.mp3" });
    expect(tracks).toEqual([{ url: "a.mp3" }]);
  });

  it("addTrackToContext returns undefined for unknown context", () => {
    expect(room.addTrackToContext("ghost", { url: "x.mp3" })).toBeUndefined();
  });

  it("removeTrackFromContext filters out the URL and resets playback if currently playing", () => {
    room.addTrackToContext("s1", { url: "a.mp3" });
    room.addTrackToContext("s1", { url: "b.mp3" });
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", contextId: "s1", audioSource: "a.mp3", trackTimeSeconds: 0 },
      Date.now()
    );
    const result = room.removeTrackFromContext("s1", "a.mp3");
    expect(result?.tracks).toEqual([{ url: "b.mp3" }]);
    expect(result?.removedCurrent).toBe(true);
    // Playback reset to paused because the playing track was removed.
    expect(room.getPlaylist("s1")?.playback.type).toBe("paused");
    expect(room.getPlaylist("s1")?.playback.audioSource).toBe("");
  });

  it("removeTrackFromContext keeps playback when the removed track wasn't current", () => {
    room.addTrackToContext("s1", { url: "a.mp3" });
    room.addTrackToContext("s1", { url: "b.mp3" });
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", contextId: "s1", audioSource: "b.mp3", trackTimeSeconds: 0 },
      Date.now()
    );
    const result = room.removeTrackFromContext("s1", "a.mp3");
    expect(result?.removedCurrent).toBe(false);
    expect(room.getPlaylist("s1")?.playback.audioSource).toBe("b.mp3");
  });
});

describe("RoomManager: client geo presence", () => {
  it("setClientGeoPosition stores the position on the client", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addClient(createMockWs({ clientId: "c1" }));
    expect(room.setClientGeoPosition("c1", { lat: 42.28, lng: -83.74 })).toBe(true);
    expect(room.getClient("c1")?.geoPosition).toEqual({ lat: 42.28, lng: -83.74 });
  });

  it("setClientGeoPosition returns false for unknown client", () => {
    const room = new RoomManager(ROOM_ID);
    expect(room.setClientGeoPosition("missing", { lat: 0, lng: 0 })).toBe(false);
  });

  it("setClientVisibility flips the hidden flag", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addClient(createMockWs({ clientId: "c1" }));
    expect(room.setClientVisibility("c1", true)).toBe(true);
    expect(room.getClient("c1")?.isHidden).toBe(true);
  });
});

describe("RoomManager: map metadata", () => {
  it("setMapMetadata is round-trippable", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    expect(room.getMapMetadata()).toEqual({ center: [42.28, -83.74], zoom: 17 });
  });
});

describe("RoomManager: map backup round-trip", () => {
  it("createBackup includes roomType, mapMetadata, shapes for map rooms", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    room.addShape(makeShape("s1"));
    room.addTrackToContext("s1", { url: "a.mp3" });

    const backup = room.createBackup();
    expect(backup.roomType).toBe("map");
    expect(backup.mapMetadata?.zoom).toBe(17);
    expect(backup.shapes).toHaveLength(1);
    expect(backup.shapes?.[0].id).toBe("s1");
    // The shape's playlist context shows up in the playlists array, alongside main.
    const ctxIds = backup.playlists.map((p) => p.id).sort();
    expect(ctxIds).toEqual(["main", "s1"]);
    expect(backup.playlists.find((p) => p.id === "s1")?.tracks).toEqual([{ url: "a.mp3" }]);
  });

  it("createBackup omits map fields for audio rooms", () => {
    const room = new RoomManager(ROOM_ID);
    const backup = room.createBackup();
    expect(backup.roomType).toBeUndefined();
    expect(backup.mapMetadata).toBeUndefined();
    expect(backup.shapes).toBeUndefined();
  });

  it("restoreMapState reconstructs roomType, mapMetadata, shapes from a backup", () => {
    const original = new RoomManager(ROOM_ID);
    original.setRoomType("map");
    original.setMapMetadata({ center: [1, 2], zoom: 10 });
    original.addShape(makeShape("s1", { falloffMeters: 100, groupId: "g1" }));

    const backup = original.createBackup();
    const restored = new RoomManager(ROOM_ID);
    restored.restoreMapState({
      roomType: backup.roomType,
      mapMetadata: backup.mapMetadata,
      shapes: backup.shapes,
    });

    expect(restored.getRoomType()).toBe("map");
    expect(restored.getMapMetadata()).toEqual({ center: [1, 2], zoom: 10 });
    const restoredShape = restored.getShape("s1");
    expect(restoredShape?.falloffMeters).toBe(100);
    expect(restoredShape?.groupId).toBe("g1");
  });
});
