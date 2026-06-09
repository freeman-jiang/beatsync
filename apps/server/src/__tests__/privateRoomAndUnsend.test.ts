import { describe, expect, it } from "bun:test";
import { RoomManager } from "@/managers/RoomManager";

describe("Private Rooms & Message Unsend", () => {
  it("should handle setting and verifying room password PINs", async () => {
    const room = new RoomManager("pw-test-room");

    // Initially public
    expect(room.getIsPrivate()).toBe(false);
    expect(await room.checkPassword("123456")).toBe(true); // Always true when public

    // Set a password PIN
    await room.setRoomPassword("654321");
    expect(room.getIsPrivate()).toBe(true);

    // Verify password check works
    expect(await room.checkPassword("654321")).toBe(true);
    expect(await room.checkPassword("111111")).toBe(false);
    expect(await room.checkPassword("")).toBe(false);

    // Clear password
    await room.setRoomPassword(null);
    expect(room.getIsPrivate()).toBe(false);
    expect(await room.checkPassword("654321")).toBe(true); // Becomes public, so anyone can join
  });

  it("should allow a user to unsend their own messages, but not others", () => {
    const room = new RoomManager("unsend-test-room");

    // Add test clients
    const clientA = {
      clientId: "client-a",
      username: "Alice",
      position: { x: 50, y: 50 },
      isActive: true,
      isAdmin: false,
      isCreator: false,
      joinedAt: Date.now(),
      rtt: 50,
      compensationMs: 0,
      nudgeMs: 0,
      lastNtpResponse: Date.now(),
      disconnectedAt: null,
    };
    const clientB = {
      clientId: "client-b",
      username: "Bob",
      position: { x: 50, y: 50 },
      isActive: true,
      isAdmin: false,
      isCreator: false,
      joinedAt: Date.now(),
      rtt: 50,
      compensationMs: 0,
      nudgeMs: 0,
      lastNtpResponse: Date.now(),
      disconnectedAt: null,
    };
    room.restoreClientData([clientA, clientB]);

    // Send a message from Alice
    const msg = room.addChatMessage({
      clientId: "client-a",
      text: "Secret message from Alice",
    });
    expect(msg.id).toBe(1);
    expect(msg.text).toBe("Secret message from Alice");
    expect(msg.isDeleted).toBe(false);

    // Bob tries to unsend Alice's message — should fail and return undefined
    const bobUnsendResult = room.unsendChatMessage(msg.id, "client-b");
    expect(bobUnsendResult).toBeUndefined();

    // The message should still be intact
    const currentMsg = room.getFullChatHistory().find((m) => m.id === msg.id);
    expect(currentMsg?.text).toBe("Secret message from Alice");
    expect(currentMsg?.isDeleted).toBe(false);

    // Alice unsends her own message — should succeed
    const aliceUnsendResult = room.unsendChatMessage(msg.id, "client-a");
    expect(aliceUnsendResult).toBeDefined();
    expect(aliceUnsendResult?.isDeleted).toBe(true);
    expect(aliceUnsendResult?.text).toBe("");

    // Verify in full history
    const history = room.getFullChatHistory();
    expect(history[0].id).toBe(1);
    expect(history[0].isDeleted).toBe(true);
    expect(history[0].text).toBe("");
  });
});
