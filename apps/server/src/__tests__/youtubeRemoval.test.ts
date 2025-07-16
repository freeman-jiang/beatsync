import { describe, expect, it, beforeEach, mock } from "bun:test";
import { handleMessage } from "../routes/websocketHandlers";
import { globalManager } from "../managers/GlobalManager";
import { Server } from "bun";
import { ClientActionEnum } from "@beatsync/shared";

// Mock the sendBroadcast and sendUnicast functions
const mockPublish = mock(() => {});
mock.module("../utils/responses", () => ({
  sendBroadcast: mock(({ server, roomId, message }) => {
    // Call the actual publish method that we can verify
    server.publish(roomId, JSON.stringify(message));
  }),
  sendUnicast: mock(() => {}),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

describe("YouTube Source Removal", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("should remove YouTube source from room and broadcast to all clients", async () => {
    // Create a room and add a YouTube source
    const roomId = "youtube-removal-room";
    const room = globalManager.getOrCreateRoom(roomId);
    
    // Add YouTube sources to the room
    room.addYouTubeSource({
      videoId: "video1",
      title: "Test Video 1",
      addedAt: Date.now(),
      addedBy: "user1",
    });
    room.addYouTubeSource({
      videoId: "video2", 
      title: "Test Video 2",
      addedAt: Date.now(),
      addedBy: "user1",
    });

    // Verify sources were added
    const initialState = room.getState();
    expect(initialState.youtubeSources).toHaveLength(2);

    // Mock WebSocket and server
    const mockWs = {
      data: {
        username: "testUser",
        clientId: "client-123",
        roomId: roomId,
      },
    };

    const mockServer = {
      publish: mockPublish,
    } as unknown as Server;

    // Create the removal message
    const removalMessage = JSON.stringify({
      type: ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE,
      videoId: "video1",
    });

    // Handle the removal message
    await handleMessage(mockWs as any, removalMessage, mockServer);

    // Verify the source was removed from the room
    const updatedState = room.getState();
    expect(updatedState.youtubeSources).toHaveLength(1);
    expect(updatedState.youtubeSources[0].videoId).toBe("video2");

    // Verify broadcast was called
    expect(mockPublish).toHaveBeenCalledWith(
      roomId,
      expect.stringContaining("REMOVE_YOUTUBE_SOURCE")
    );
  });

  it("should clear selected YouTube ID when removing the currently selected video", async () => {
    // Create a room and add/select a YouTube source
    const roomId = "selected-removal-room";
    const room = globalManager.getOrCreateRoom(roomId);
    
    // Add and select a YouTube source
    room.addYouTubeSource({
      videoId: "selected-video",
      title: "Selected Video",
      addedAt: Date.now(),
      addedBy: "user1",
    });
    room.setSelectedYouTubeId("selected-video");

    // Verify selection
    const initialState = room.getState();
    expect(initialState.selectedYouTubeId).toBe("selected-video");

    // Mock WebSocket and server
    const mockWs = {
      data: {
        username: "testUser",
        clientId: "client-123",
        roomId: roomId,
      },
    };

    const mockServer = {
      publish: mockPublish,
    } as unknown as Server;

    // Create the removal message for the selected video
    const removalMessage = JSON.stringify({
      type: ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE,
      videoId: "selected-video",
    });

    // Handle the removal message
    await handleMessage(mockWs as any, removalMessage, mockServer);

    // Verify the selection was cleared
    const updatedState = room.getState();
    expect(updatedState.youtubeSources).toHaveLength(0);
    expect(updatedState.selectedYouTubeId).toBeUndefined();
  });

  it("should not affect other videos when removing a specific video", async () => {
    // Create a room with multiple YouTube sources
    const roomId = "multiple-videos-room";
    const room = globalManager.getOrCreateRoom(roomId);
    
    // Add multiple YouTube sources
    room.addYouTubeSource({
      videoId: "keep-video1",
      title: "Keep Video 1",
      addedAt: Date.now(),
      addedBy: "user1",
    });
    room.addYouTubeSource({
      videoId: "remove-video",
      title: "Remove Video",
      addedAt: Date.now(),
      addedBy: "user1",
    });
    room.addYouTubeSource({
      videoId: "keep-video2",
      title: "Keep Video 2", 
      addedAt: Date.now(),
      addedBy: "user1",
    });

    // Select a video that will remain
    room.setSelectedYouTubeId("keep-video1");

    // Mock WebSocket and server
    const mockWs = {
      data: {
        username: "testUser",
        clientId: "client-123",
        roomId: roomId,
      },
    };

    const mockServer = {
      publish: mockPublish,
    } as unknown as Server;

    // Remove the middle video
    const removalMessage = JSON.stringify({
      type: ClientActionEnum.enum.REMOVE_YOUTUBE_SOURCE,
      videoId: "remove-video",
    });

    await handleMessage(mockWs as any, removalMessage, mockServer);

    // Verify only the correct video was removed
    const updatedState = room.getState();
    expect(updatedState.youtubeSources).toHaveLength(2);
    expect(updatedState.youtubeSources.map(s => s.videoId)).toEqual(["keep-video1", "keep-video2"]);
    expect(updatedState.selectedYouTubeId).toBe("keep-video1"); // Selection should remain
  });
});
