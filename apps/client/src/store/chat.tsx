import { ChatMessageType } from "@beatsync/shared";
import { create } from "zustand";

interface ChatState {
  messages: ChatMessageType[];
  newestId: number;
  isRoomPrivate: boolean;

  // Actions
  setMessages: (messages: ChatMessageType[], isFullSync: boolean, newestId: number) => void;
  addMessage: (message: ChatMessageType) => void;
  deleteMessage: (messageId: number) => void;
  setIsRoomPrivate: (isPrivate: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  newestId: 0,
  isRoomPrivate: false,

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

  deleteMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, isDeleted: true, text: "" } : m)),
    }));
  },

  setIsRoomPrivate: (isPrivate) => {
    set({ isRoomPrivate: isPrivate });
  },

  reset: () => {
    set({
      messages: [],
      newestId: 0,
    });
  },
}));
