import type { Server } from "bun";

export interface WSData {
  roomId: string;
  clientId: string;
  username: string;
  isAdmin: boolean;
  isCreator: boolean;
}

export type BunServer = Server<WSData>;
