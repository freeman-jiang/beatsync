import { jsonResponse } from "../utils/responses";
import { globalManager } from "../managers/GlobalManager";
import type { GetActiveRoomsType } from "@beatsync/shared";

export function getActiveRooms(_req: Request) {
  const response: GetActiveRoomsType = globalManager.getActiveUserCount();
  return jsonResponse(response);
}
