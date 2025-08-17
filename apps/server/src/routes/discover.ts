import { globalManager } from "../managers/GlobalManager";
import { jsonResponse } from "../utils/responses";

export async function handleDiscover(_req: Request) {
  return jsonResponse(globalManager.getActiveRooms());
}
