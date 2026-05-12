import { NewSyncer } from "@/components/NewSyncer";
import { validateFullRoomId } from "@/lib/room";

// Force dynamic rendering and disable caching. Map rooms are inherently per-session.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MapRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  if (!validateFullRoomId(roomId)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <div>
          Invalid room ID: <span className="font-bold">{roomId}</span>.
        </div>
        <div className="text-sm text-gray-500">Please enter a valid 6-digit numeric code.</div>
      </div>
    );
  }

  // Pass requestedRoomType="map" through to NewSyncer → WebSocketManager so the WS
  // upgrade query string carries roomType=map. The server uses this to lock the room's
  // type on first connect.
  return <NewSyncer roomId={roomId} requestedRoomType="map" />;
}
