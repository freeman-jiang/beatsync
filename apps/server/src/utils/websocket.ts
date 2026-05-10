import type { RoomTypeValue } from "@beatsync/shared";
import type { Server } from "bun";

export interface WSData {
  roomId: string;
  clientId: string;
  username: string;
  isAdmin: boolean;
  isCreator: boolean;
  // Requested room type from the WS upgrade query string. The first client to connect to
  // a room determines its type; subsequent clients with a different requested type get
  // the room's existing type instead.
  requestedRoomType?: RoomTypeValue;
}

export type BunServer = Server<WSData>;
