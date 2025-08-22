import { ChatMessageType, ClientDataType, epochNow } from "@beatsync/shared";

/**
 * ChatManager handles all chat-related operations for a room.
 * Maintains a rolling buffer of messages with simple validation.
 */
export class ChatManager {
  private chatMessages: ChatMessageType[] = [];
  private nextMessageId: number = 1;
  private readonly MAX_CHAT_MESSAGES = 300;
  private readonly roomId: string;

  constructor({ roomId }: { roomId: string }) {
    this.roomId = roomId;
  }

  /**
   * Add a chat message to the room
   */
  addMessage({
    client,
    text,
  }: {
    client: ClientDataType;
    text: string;
  }): ChatMessageType {
    // Minimal validation - React handles XSS protection on the client
    if (!text) {
      throw new Error("Chat message cannot be empty");
    }

    const message: ChatMessageType = {
      id: this.nextMessageId++,
      clientId: client.clientId,
      username: client.username,
      text: text,
      timestamp: epochNow(),
      countryCode: client.location?.countryCode,
    };

    this.chatMessages.push(message);

    // Rolling buffer - remove oldest if over limit
    if (this.chatMessages.length > this.MAX_CHAT_MESSAGES) {
      this.chatMessages.shift();
    }

    return message;
  }

  /**
   * Get chat history
   */
  getFullHistory(): ChatMessageType[] {
    return this.chatMessages;
  }

  /**
   * Get the newest message ID
   */
  getNewestId(): number {
    if (this.chatMessages.length === 0) return 0;
    return this.chatMessages[this.chatMessages.length - 1].id;
  }

  /**
   * Get the next message ID (for backup purposes)
   */
  getNextMessageId(): number {
    return this.nextMessageId;
  }

  /**
   * Restore chat messages from backup
   */
  restoreMessages(messages: ChatMessageType[], nextMessageId: number): void {
    // Validate and restore messages
    this.chatMessages = messages.slice(-this.MAX_CHAT_MESSAGES); // Ensure we don't exceed max

    // Restore the message ID counter
    if (nextMessageId > 0) {
      this.nextMessageId = nextMessageId;
    }
  }
}
