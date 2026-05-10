// Tests for the map-room additions to RoomManager: shape state CRUD, per-shape playlist
// management, per-shape playback scheduling, client geo-position presence, and backup/restore.

import type { ShapeType, WSBroadcastType, WSUnicastType } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { RoomManager } from "@/managers/RoomManager";
import type { BunServer, WSData } from "@/utils/websocket";

let unicastMessages: { ws: ServerWebSocket<WSData>; message: WSUnicastType }[] = [];
let broadcastMessages: { server: BunServer; roomId: string; message: WSBroadcastType }[] = [];

mockR2();

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(
    ({ server, roomId, message }: { server: BunServer; roomId: string; message: WSBroadcastType }) => {
      broadcastMessages.push({ server, roomId, message });
    }
  ),
  sendUnicast: mock(({ ws, message }: { ws: ServerWebSocket<WSData>; message: WSUnicastType }) => {
    unicastMessages.push({ ws, message });
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "map-test-room";

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

describe("RoomManager: room type", () => {
  it("defaults to audio rooms for backwards compatibility", () => {
    const room = new RoomManager(ROOM_ID);
    expect(room.getRoomType()).toBe("audio");
    expect(room.isMapRoom()).toBe(false);
  });

  it("can be set to map at construction time (before any clients)", () => {
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

  it("starts with an empty shape list", () => {
    expect(room.getShapeStates()).toEqual([]);
  });

  it("addShape returns true on first add and false on duplicate", () => {
    const shape = makeShape("s1");
    expect(room.addShape(shape)).toBe(true);
    expect(room.addShape(shape)).toBe(false);
  });

  it("getShapeStates returns geometry + empty playlist + paused state after addShape", () => {
    room.addShape(makeShape("s1"));
    const states = room.getShapeStates();
    expect(states).toHaveLength(1);
    expect(states[0].shape.id).toBe("s1");
    expect(states[0].playlist).toEqual([]);
    expect(states[0].playbackState.type).toBe("paused");
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
    expect(room.getShape("s1")!.shape.coordinates).toEqual(newCoords);
    // Loop/groupId/radius unchanged
    expect(room.getShape("s1")!.shape.loop).toBe(true);
  });

  it("updateShapeCoordinates on a missing shape returns false", () => {
    expect(room.updateShapeCoordinates("missing", [])).toBe(false);
  });

  it("deleteShape returns true on existing shape and false on missing", () => {
    room.addShape(makeShape("s1"));
    expect(room.deleteShape("s1")).toBe(true);
    expect(room.deleteShape("s1")).toBe(false);
    expect(room.getShapeStates()).toEqual([]);
  });

  it("clearShapes removes all shapes", () => {
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    room.clearShapes();
    expect(room.getShapeStates()).toEqual([]);
  });

  it("setShapeLoop / setShapeGroup / setShapeAudibleRadius update only their field", () => {
    room.addShape(makeShape("s1"));
    expect(room.setShapeLoop("s1", false)).toBe(true);
    expect(room.setShapeGroup("s1", "group-a")).toBe(true);
    expect(room.setShapeAudibleRadius("s1", 200)).toBe(true);
    const s = room.getShape("s1")!.shape;
    expect(s.loop).toBe(false);
    expect(s.groupId).toBe("group-a");
    expect(s.audibleRadiusMeters).toBe(200);
  });

  it("returns false for setters when the shape is missing", () => {
    expect(room.setShapeLoop("missing", true)).toBe(false);
    expect(room.setShapeGroup("missing", null)).toBe(false);
    expect(room.setShapeAudibleRadius("missing", 100)).toBe(false);
  });
});

describe("RoomManager: shape playlist operations", () => {
  let room: RoomManager;
  beforeEach(() => {
    room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
  });

  it("addShapeAudioSource appends to the playlist", () => {
    const playlist = room.addShapeAudioSource("s1", { url: "a.mp3" });
    expect(playlist).toEqual([{ url: "a.mp3" }]);
    const more = room.addShapeAudioSource("s1", { url: "b.mp3" });
    expect(more).toEqual([{ url: "a.mp3" }, { url: "b.mp3" }]);
  });

  it("addShapeAudioSource returns undefined for missing shape", () => {
    expect(room.addShapeAudioSource("missing", { url: "x.mp3" })).toBeUndefined();
  });

  it("removeShapeAudioSources filters by URL and resets playback if current track removed", () => {
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    room.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "a.mp3", trackTimeSeconds: 0 }, Date.now());

    const result = room.removeShapeAudioSources("s1", ["a.mp3"])!;
    expect(result.playlist).toEqual([{ url: "b.mp3" }]);
    expect(result.removedCurrent).toBe(true);
    expect(room.getShape("s1")!.playback.type).toBe("paused");
    expect(room.getShape("s1")!.playback.audioSource).toBe("");
  });

  it("removeShapeAudioSources preserves playback when current track survives", () => {
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    room.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "b.mp3", trackTimeSeconds: 0 }, Date.now());

    const result = room.removeShapeAudioSources("s1", ["a.mp3"])!;
    expect(result.removedCurrent).toBe(false);
    expect(room.getShape("s1")!.playback.audioSource).toBe("b.mp3");
  });

  it("reorderShapePlaylist updates order when lengths match", () => {
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    room.addShapeAudioSource("s1", { url: "c.mp3" });
    const reordered = room.reorderShapePlaylist("s1", [{ url: "c.mp3" }, { url: "a.mp3" }, { url: "b.mp3" }]);
    expect(Array.isArray(reordered)).toBe(true);
    expect((reordered as { url: string }[])[0].url).toBe("c.mp3");
  });

  it("reorderShapePlaylist returns Error when lengths mismatch", () => {
    room.addShapeAudioSource("s1", { url: "a.mp3" });
    room.addShapeAudioSource("s1", { url: "b.mp3" });
    const result = room.reorderShapePlaylist("s1", [{ url: "a.mp3" }]);
    expect(result).toBeInstanceOf(Error);
  });
});

describe("RoomManager: shape playback scheduling", () => {
  let room: RoomManager;
  beforeEach(() => {
    room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    room.addShapeAudioSource("s1", { url: "track-2.mp3" });
  });

  it("updateShapePlaybackPlay records trackIndex from the playlist", () => {
    const ok = room.updateShapePlaybackPlay(
      "s1",
      { type: "PLAY", audioSource: "track-2.mp3", trackTimeSeconds: 5 },
      1000
    );
    expect(ok).toBe(true);
    const pb = room.getShape("s1")!.playback;
    expect(pb.type).toBe("playing");
    expect(pb.audioSource).toBe("track-2.mp3");
    expect(pb.trackIndex).toBe(1);
    expect(pb.trackPositionSeconds).toBe(5);
    expect(pb.serverTimeToExecute).toBe(1000);
  });

  it("updateShapePlaybackPlay rejects a track not in the shape's playlist", () => {
    const ok = room.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "nope.mp3", trackTimeSeconds: 0 }, 1000);
    expect(ok).toBe(false);
    expect(room.getShape("s1")!.playback.type).toBe("paused");
  });

  it("updateShapePlaybackPause records pause at the given position", () => {
    room.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "track-1.mp3", trackTimeSeconds: 0 }, 1000);
    const ok = room.updateShapePlaybackPause(
      "s1",
      { type: "PAUSE", audioSource: "track-1.mp3", trackTimeSeconds: 12.5 },
      2000
    );
    expect(ok).toBe(true);
    const pb = room.getShape("s1")!.playback;
    expect(pb.type).toBe("paused");
    expect(pb.trackPositionSeconds).toBe(12.5);
  });
});

describe("RoomManager: shape audio-load coordination", () => {
  beforeEach(() => {
    broadcastMessages = [];
    unicastMessages = [];
  });

  it("initiateShapeAudioLoad broadcasts a shape-scoped LOAD_AUDIO_SOURCE", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    const ws = createMockWs({ clientId: "c1" });
    room.addClient(ws);
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });

    room.initiateShapeAudioLoad(
      "s1",
      { type: "PLAY", audioSource: "track-1.mp3", trackTimeSeconds: 0 },
      "c1",
      createMockServer()
    );

    const loadEvents = broadcastMessages.filter(
      (b) => b.message.type === "ROOM_EVENT" && b.message.event.type === "LOAD_AUDIO_SOURCE"
    );
    expect(loadEvents).toHaveLength(1);
    const ev = loadEvents[0].message as Extract<WSBroadcastType, { type: "ROOM_EVENT" }>;
    if (ev.event.type !== "LOAD_AUDIO_SOURCE") throw new Error("expected LOAD_AUDIO_SOURCE");
    expect(ev.event.shapeId).toBe("s1");
    expect(ev.event.audioSourceToPlay.url).toBe("track-1.mp3");
  });

  it("processClientLoadedShapeAudio broadcasts SCHEDULED_ACTION once all clients are loaded", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    const w1 = createMockWs({ clientId: "c1" });
    const w2 = createMockWs({ clientId: "c2" });
    room.addClient(w1);
    room.addClient(w2);
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    const server = createMockServer();

    room.initiateShapeAudioLoad("s1", { type: "PLAY", audioSource: "track-1.mp3", trackTimeSeconds: 0 }, "c1", server);
    broadcastMessages = []; // discard the LOAD event

    // The initiator is NOT pre-counted (so map rooms don't drift between admin's
    // late-replay path and other clients' on-time path). Both clients must report.
    room.processClientLoadedShapeAudio("s1", "c1", server);
    expect(broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION")).toHaveLength(0);

    room.processClientLoadedShapeAudio("s1", "c2", server);
    const scheduled = broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PLAY") throw new Error("expected PLAY scheduled action");
    expect(sa.scheduledAction.shapeId).toBe("s1");
    expect(sa.scheduledAction.audioSource).toBe("track-1.mp3");
    expect(sa.serverTimeToExecute).toBeGreaterThan(Date.now() - 100);

    // Playback state should now reflect playing
    expect(room.getShape("s1")!.playback.type).toBe("playing");
  });

  it("disconnecting a client during loading does not strand the pending play", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    const w1 = createMockWs({ clientId: "c1" });
    const w2 = createMockWs({ clientId: "c2" });
    room.addClient(w1);
    room.addClient(w2);
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    const server = createMockServer();

    room.initiateShapeAudioLoad("s1", { type: "PLAY", audioSource: "track-1.mp3", trackTimeSeconds: 0 }, "c1", server);
    broadcastMessages = [];

    // c1 (initiator) reports loaded; gate still waiting on c2.
    room.processClientLoadedShapeAudio("s1", "c1", server);
    expect(broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION")).toHaveLength(0);

    // c2 leaves before reporting loaded — removeClient's pending-play sweep should now
    // fire the schedule because c1 (the only remaining client) is loaded.
    room.removeClient("c2");

    const scheduled = broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
  });

  it("broadcastShapePause emits a shape-scoped PAUSE", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addClient(createMockWs({ clientId: "c1" }));
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "track-1.mp3" });
    room.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "track-1.mp3", trackTimeSeconds: 0 }, 1);

    room.broadcastShapePause(
      "s1",
      { type: "PAUSE", audioSource: "track-1.mp3", trackTimeSeconds: 7.5 },
      createMockServer()
    );

    const scheduled = broadcastMessages.filter((b) => b.message.type === "SCHEDULED_ACTION");
    expect(scheduled).toHaveLength(1);
    const sa = scheduled[0].message as Extract<WSBroadcastType, { type: "SCHEDULED_ACTION" }>;
    if (sa.scheduledAction.type !== "PAUSE") throw new Error("expected PAUSE");
    expect(sa.scheduledAction.shapeId).toBe("s1");
    expect(sa.scheduledAction.trackTimeSeconds).toBe(7.5);
    expect(room.getShape("s1")!.playback.type).toBe("paused");
  });
});

describe("RoomManager: groups", () => {
  it("getShapeIdsInSameGroup returns just [self] when solo", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addShape(makeShape("s1"));
    room.addShape(makeShape("s2"));
    expect(room.getShapeIdsInSameGroup("s1")).toEqual(["s1"]);
  });

  it("returns all shapes sharing a groupId", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addShape(makeShape("s1", { groupId: "g1" }));
    room.addShape(makeShape("s2", { groupId: "g1" }));
    room.addShape(makeShape("s3", { groupId: "g2" }));
    room.addShape(makeShape("s4"));
    const ids = room.getShapeIdsInSameGroup("s1").sort();
    expect(ids).toEqual(["s1", "s2"]);
  });

  it("returns [] for an unknown shape id", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    expect(room.getShapeIdsInSameGroup("nope")).toEqual([]);
  });
});

describe("RoomManager: client geo presence", () => {
  it("setClientGeoPosition stores the position on the client record", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addClient(createMockWs({ clientId: "c1" }));
    expect(room.setClientGeoPosition("c1", { lat: 42.28, lng: -83.74 })).toBe(true);
    expect(room.getClient("c1")!.geoPosition).toEqual({ lat: 42.28, lng: -83.74 });
  });

  it("setClientGeoPosition returns false for unknown clients", () => {
    const room = new RoomManager(ROOM_ID);
    expect(room.setClientGeoPosition("missing", { lat: 0, lng: 0 })).toBe(false);
  });

  it("setClientVisibility flips the hidden flag", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.addClient(createMockWs({ clientId: "c1" }));
    expect(room.setClientVisibility("c1", true)).toBe(true);
    expect(room.getClient("c1")!.isHidden).toBe(true);
    expect(room.setClientVisibility("c1", false)).toBe(true);
    expect(room.getClient("c1")!.isHidden).toBe(false);
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

describe("RoomManager: backup/restore (map)", () => {
  it("createBackup omits map fields for audio rooms", () => {
    const room = new RoomManager(ROOM_ID);
    const backup = room.createBackup();
    expect(backup.roomType).toBeUndefined();
    expect(backup.mapMetadata).toBeUndefined();
    expect(backup.shapes).toBeUndefined();
  });

  it("createBackup includes map fields when applicable", () => {
    const room = new RoomManager(ROOM_ID);
    room.setRoomType("map");
    room.setMapMetadata({ center: [42.28, -83.74], zoom: 17 });
    room.addShape(makeShape("s1"));
    room.addShapeAudioSource("s1", { url: "a.mp3" });

    const backup = room.createBackup();
    expect(backup.roomType).toBe("map");
    expect(backup.mapMetadata?.zoom).toBe(17);
    expect(backup.shapes).toHaveLength(1);
    expect(backup.shapes![0].shape.id).toBe("s1");
    expect(backup.shapes![0].playlist).toEqual([{ url: "a.mp3" }]);
  });

  it("restoreMapState reconstructs roomType, mapMetadata, and shapes from a backup", () => {
    const room = new RoomManager(ROOM_ID);
    const original = new RoomManager(ROOM_ID);
    original.setRoomType("map");
    original.setMapMetadata({ center: [1, 2], zoom: 10 });
    original.addShape(makeShape("s1", { loop: false, groupId: "g1" }));
    original.addShapeAudioSource("s1", { url: "a.mp3" });
    original.updateShapePlaybackPlay("s1", { type: "PLAY", audioSource: "a.mp3", trackTimeSeconds: 3 }, 999);

    const backup = original.createBackup();
    room.restoreMapState({
      roomType: backup.roomType,
      mapMetadata: backup.mapMetadata,
      shapes: backup.shapes,
    });

    expect(room.getRoomType()).toBe("map");
    expect(room.getMapMetadata()).toEqual({ center: [1, 2], zoom: 10 });
    expect(room.getShapeStates()).toHaveLength(1);
    const restored = room.getShape("s1")!;
    expect(restored.shape.loop).toBe(false);
    expect(restored.shape.groupId).toBe("g1");
    expect(restored.playlist).toEqual([{ url: "a.mp3" }]);
    expect(restored.playback.type).toBe("playing");
    expect(restored.playback.trackPositionSeconds).toBe(3);
  });
});
