import type { Server } from "bun";

export interface WSData {
  roomId: string;
  clientId: string;
  username: string;
}

export type BunServer = Server<WSData>;
