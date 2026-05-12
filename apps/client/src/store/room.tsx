"use client";
import type { MapMetadataType, RoomTypeValue } from "@beatsync/shared";
import { create } from "zustand";

// Interface for just the state values (without methods)
interface RoomStateValues {
  roomId: string;
  username: string;
  isLoadingRoom: boolean;
  // Set from the URL: which room type did this tab request? Map rooms come in via
  // /map/{roomId}; audio rooms via /room/{roomId}. The server gets final say via
  // ROOM_TYPE_INFO — see `roomType` below.
  requestedRoomType?: RoomTypeValue;
  // Server-confirmed room type. Set when ROOM_TYPE_INFO arrives on connect.
  // `undefined` until the first ROOM_TYPE_INFO, so the UI can show a loading state.
  roomType?: RoomTypeValue;
  // Default Leaflet view for map rooms — server-driven via MAP_METADATA_UPDATE.
  mapMetadata?: MapMetadataType;
}

interface RoomState extends RoomStateValues {
  setRoomId: (roomId: string) => void;
  setUsername: (username: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setRequestedRoomType: (roomType: RoomTypeValue | undefined) => void;
  setRoomType: (roomType: RoomTypeValue) => void;
  setMapMetadata: (metadata: MapMetadataType) => void;
  reset: () => void;
}

// Define initial state object
const initialState: RoomStateValues = {
  roomId: "",
  username: "",
  isLoadingRoom: false,
  requestedRoomType: undefined,
  roomType: undefined,
  mapMetadata: undefined,
};

export const useRoomStore = create<RoomState>()((set) => ({
  // Set initial state
  ...initialState,

  // Actions
  setRoomId: (roomId) => set({ roomId }),
  setUsername: (username) => set({ username }),
  setIsLoading: (isLoading) => set({ isLoadingRoom: isLoading }),
  setRequestedRoomType: (requestedRoomType) => set({ requestedRoomType }),
  setRoomType: (roomType) => set({ roomType }),
  setMapMetadata: (mapMetadata) => set({ mapMetadata }),

  // Reset to initial state
  reset: () =>
    set((state) => ({
      ...initialState,
      username: state.username, // Preserve the current username
    })),
}));
