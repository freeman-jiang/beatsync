import { globalManager } from "@/managers";
import { errorResponse, jsonResponse } from "@/utils/responses";
import { CheckRoomPasswordSchema } from "@beatsync/shared/types/HTTPRequest";

/**
 * POST /check-password
 * Body: { roomId: string, password: string }
 *
 * Verifies the 6-digit PIN for a private room.
 * - Returns { success: true } if the room doesn't exist yet (it will be public when created).
 * - Returns { success: true/false } based on bcrypt comparison if the room is private.
 */
export const handleCheckPassword = async (req: Request): Promise<Response> => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = CheckRoomPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const { roomId, password } = parsed.data;
  const room = globalManager.getRoom(roomId);

  // Room doesn't exist yet → it will be public on first join
  if (!room?.getIsPrivate()) {
    return jsonResponse({ success: true });
  }

  const success = await room.checkPassword(password);
  return jsonResponse({ success });
};
