import { describe, expect, it, beforeEach, mock } from "bun:test";
import { handleOpen } from "../routes/websocketHandlers";
import { globalManager } from "../managers/GlobalManager";
import { Server } from "bun";

// Mock the sendBroadcast and sendUnicast functions
mock.module("../utils/responses", () => ({
  sendBroadcast: mock(() => {}),
  sendUnicast: mock(() => {}),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

describe("Room State Synchronization", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("should send current selected audio and playback state to newly joined client", () => {
    // Create a room and set up state
    const roomId = "state-sync-room";
    const room = globalManager.getOrCreateRoom(roomId);
    
    // Add some audio sources
    room.addAudioSource({ url: "https://example.com/song1.mp3" });
    room.addAudioSource({ url: "https://example.com/song2.mp3" });
    
    // Set selected audio and playback state
    room.setSelectedAudioId("audio-123");
    room.updatePlaybackState(true, 45.5); // Playing at 45.5 seconds

    // Track messages sent to the WebSocket
    const sentMessages: string[] = [];
    const mockWs = {
      data: {
        username: "newUser",
        clientId: "client-456",
        roomId: roomId,
      },
      subscribe: mock(() => {}),
      send: mock((message: string) => {
        sentMessages.push(message);
      }),
    };

    const mockServer = {
      publish: mock(() => {}),
    } as unknown as Server;

    // Simulate client connection
    handleOpen(mockWs as any, mockServer);

    // Verify SELECTED_AUDIO_CHANGE was sent
    const selectedAudioMessage = sentMessages.find((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return (
          parsed.type === "ROOM_EVENT" &&
          parsed.event?.type === "SELECTED_AUDIO_CHANGE"
        );
      } catch {
        return false;
      }
    });

    expect(selectedAudioMessage).toBeTruthy();
    const parsedAudio = JSON.parse(selectedAudioMessage!);
    expect(parsedAudio.event.audioId).toBe("audio-123");

    // Verify PLAYBACK_STATE was sent
    const playbackStateMessage = sentMessages.find((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return (
          parsed.type === "ROOM_EVENT" &&
          parsed.event?.type === "PLAYBACK_STATE"
        );
      } catch {
        return false;
      }
    });

    expect(playbackStateMessage).toBeTruthy();
    const parsedPlayback = JSON.parse(playbackStateMessage!);
    expect(parsedPlayback.event.isPlaying).toBe(true);
    expect(parsedPlayback.event.currentTime).toBe(45.5);
    expect(parsedPlayback.event.selectedAudioId).toBe("audio-123");
  });

  it("should send current selected YouTube video to newly joined client", () => {
    // Create a room and set up YouTube state
    const roomId = "youtube-sync-room";
    const room = globalManager.getOrCreateRoom(roomId);
    
    // Add YouTube sources
    room.addYouTubeSource({
      videoId: "abc123",
      title: "Test Video",
      addedAt: Date.now(),
      addedBy: "user1",
    });
    
    // Set selected YouTube video
    room.setSelectedYouTubeId("abc123");

    // Track messages sent to the WebSocket
    const sentMessages: string[] = [];
    const mockWs = {
      data: {
        username: "newUser",
        clientId: "client-789",
        roomId: roomId,
      },
      subscribe: mock(() => {}),
      send: mock((message: string) => {
        sentMessages.push(message);
      }),
    };

    const mockServer = {
      publish: mock(() => {}),
    } as unknown as Server;

    // Simulate client connection
    handleOpen(mockWs as any, mockServer);

    // Verify SELECTED_YOUTUBE_CHANGE was sent
    const selectedYouTubeMessage = sentMessages.find((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return (
          parsed.type === "ROOM_EVENT" &&
          parsed.event?.type === "SELECTED_YOUTUBE_CHANGE"
        );
      } catch {
        return false;
      }
    });

    expect(selectedYouTubeMessage).toBeTruthy();
    const parsedYouTube = JSON.parse(selectedYouTubeMessage!);
    expect(parsedYouTube.event.videoId).toBe("abc123");
  });

  it("should not send playback state or selections when none are set", () => {
    // Create an empty room
    const roomId = "empty-sync-room";
    globalManager.getOrCreateRoom(roomId);

    // Track messages sent to the WebSocket
    const sentMessages: string[] = [];
    const mockWs = {
      data: {
        username: "newUser",
        clientId: "client-empty",
        roomId: roomId,
      },
      subscribe: mock(() => {}),
      send: mock((message: string) => {
        sentMessages.push(message);
      }),
    };

    const mockServer = {
      publish: mock(() => {}),
    } as unknown as Server;

    // Simulate client connection
    handleOpen(mockWs as any, mockServer);

    // Verify no state sync messages were sent
    const stateMessages = sentMessages.filter((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return (
          parsed.type === "ROOM_EVENT" &&
          (parsed.event?.type === "SELECTED_AUDIO_CHANGE" ||
           parsed.event?.type === "SELECTED_YOUTUBE_CHANGE" ||
           parsed.event?.type === "PLAYBACK_STATE")
        );
      } catch {
        return false;
      }
    });

    expect(stateMessages).toHaveLength(0);
  });
});
