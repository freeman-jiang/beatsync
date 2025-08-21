import { ChatMessageType, ClientDataType, epochNow } from "@beatsync/shared";

/**
 * ChatManager handles all chat-related operations for a room.
 * Maintains a rolling buffer of messages and handles sanitization.
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
    // Sanitize text - strip HTML tags and trim
    const sanitizedText = text.replace(/<[^>]*>/g, "").trim();

    if (!sanitizedText) {
      throw new Error("Chat message cannot be empty");
    }

    const message: ChatMessageType = {
      id: this.nextMessageId++,
      clientId: client.clientId,
      username: client.username,
      text: sanitizedText,
      timestamp: epochNow(),
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
}
