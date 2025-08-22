import { ChatMessageType } from "@beatsync/shared";
import { describe, expect, it } from "bun:test";
import { ChatManager } from "../managers/ChatManager";
import { RoomManager } from "../managers/RoomManager";

describe("Chat Persistence", () => {
  it("should backup and restore chat messages correctly", () => {
    const roomId = "test-room-123";
    const room = new RoomManager(roomId);

    // Add a test client by manually adding to client data
    // We need to bypass addClient since it expects a WebSocket
    const testClient = {
      clientId: "client-1",
      username: "TestUser",
      position: { x: 50, y: 50 },
      isActive: true,
      isAdmin: false,
      joinedAt: Date.now(),
      rtt: 50,
      lastNtpResponse: Date.now(),
      disconnectedAt: null,
    };
    room.restoreClientData([testClient]);

    // Add some chat messages
    const messages = [
      { clientId: "client-1", text: "Hello world!" },
      { clientId: "client-1", text: "This is a test message" },
      { clientId: "client-1", text: "Testing persistence" },
    ];

    const addedMessages: ChatMessageType[] = [];
    messages.forEach((msg) => {
      const chatMessage = room.addChatMessage(msg);
      addedMessages.push(chatMessage);
    });

    // Create backup
    const backup = room.createBackup();

    // Verify backup contains chat messages
    expect(backup.chat).toBeDefined();
    expect(backup.chat?.messages.length).toBe(3);
    expect(backup.chat?.nextMessageId).toBeDefined();
    expect(backup.chat?.nextMessageId).toBe(4); // Should be 4 after adding 3 messages

    // Verify message content
    expect(backup.chat?.messages[0].text).toBe("Hello world!");
    expect(backup.chat?.messages[1].text).toBe("This is a test message");
    expect(backup.chat?.messages[2].text).toBe("Testing persistence");

    // Create a new room and restore from backup
    const restoredRoom = new RoomManager(roomId);

    // Restore the chat history
    if (backup.chat) {
      restoredRoom.restoreChatHistory(backup.chat);
    }

    // Verify restored messages
    const restoredMessages = restoredRoom.getFullChatHistory();
    expect(restoredMessages.length).toBe(3);
    expect(restoredMessages[0].text).toBe("Hello world!");
    expect(restoredMessages[1].text).toBe("This is a test message");
    expect(restoredMessages[2].text).toBe("Testing persistence");

    // Verify message IDs are preserved
    expect(restoredMessages[0].id).toBe(1);
    expect(restoredMessages[1].id).toBe(2);
    expect(restoredMessages[2].id).toBe(3);

    // Add a new message to verify ID counter continues correctly
    restoredRoom.restoreClientData([testClient]);
    const newMessage = restoredRoom.addChatMessage({
      clientId: "client-1",
      text: "New message after restore",
    });

    expect(newMessage.id).toBe(4); // Should continue from where it left off
  });

  it("should handle empty chat history gracefully", () => {
    const roomId = "empty-room";
    const room = new RoomManager(roomId);

    // Create backup with no messages
    const backup = room.createBackup();

    expect(backup.chat).toBeDefined();
    expect(backup.chat?.messages.length).toBe(0);
    expect(backup.chat?.nextMessageId).toBe(1);

    // Restore to new room
    const restoredRoom = new RoomManager(roomId);
    if (backup.chat) {
      restoredRoom.restoreChatHistory(backup.chat);
    }

    const restoredMessages = restoredRoom.getFullChatHistory();
    expect(restoredMessages.length).toBe(0);
  });

  it("should enforce message limit during restore", () => {
    const roomId = "overflow-room";
    const room = new RoomManager(roomId);

    // Create a ChatManager to test the limit directly
    const chatManager = new ChatManager({ roomId });

    // Create more than MAX_CHAT_MESSAGES (300) messages
    const manyMessages: ChatMessageType[] = [];
    for (let i = 1; i <= 350; i++) {
      manyMessages.push({
        id: i,
        clientId: "client-1",
        username: "TestUser",
        text: `Message ${i}`,
        timestamp: Date.now() + i,
      });
    }

    // Restore with too many messages
    chatManager.restoreMessages(manyMessages, 351);

    // Should only keep the last 300 messages
    const restored = chatManager.getFullHistory();
    expect(restored.length).toBe(300);
    expect(restored[0].text).toBe("Message 51"); // First kept message
    expect(restored[299].text).toBe("Message 350"); // Last message
    expect(chatManager.getNextMessageId()).toBe(351);
  });
});
