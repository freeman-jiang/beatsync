"use client";
import { create } from "zustand";

// Interface for just the state values (without methods)
interface RoomStateValues {
  roomId: string;
  username: string;
  isLoadingRoom: boolean;
}

interface RoomState extends RoomStateValues {
  setRoomId: (roomId: string) => void;
  setUsername: (username: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
}

// Define initial state object
const initialState: RoomStateValues = {
  roomId: "",
  username: "",
  isLoadingRoom: false,
};

export const useRoomStore = create<RoomState>()((set) => ({
  // Set initial state
  ...initialState,

  // Actions
  setRoomId: (roomId) => set({ roomId }),
  setUsername: (username) => set({ username }),
  setIsLoading: (isLoading) => set({ isLoadingRoom: isLoading }),

  // Reset to initial state
  reset: () =>
    set((state) => ({
      ...initialState,
      username: state.username, // Preserve the current username
    })),
}));
