import { ChatMessageType } from "@beatsync/shared";
import { create } from "zustand";

interface ChatState {
  messages: ChatMessageType[];
  newestId: number;

  // Actions
  setMessages: (
    messages: ChatMessageType[],
    isFullSync: boolean,
    newestId: number
  ) => void;
  addMessage: (message: ChatMessageType) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  newestId: 0,

  setMessages: (messages, isFullSync, newestId) => {
    set((state) => {
      if (isFullSync) {
        // Replace all messages with new ones
        return { messages, newestId };
      } else {
        // Only append messages newer than our current newest ID
        const newMessages = messages.filter((m) => m.id > state.newestId);
        return {
          messages: [...state.messages, ...newMessages],
          newestId: Math.max(newestId, state.newestId),
        };
      }
    });
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      newestId: message.id,
    }));
  },

  reset: () => {
    set({
      messages: [],
      newestId: 0,
    });
  },
}));
