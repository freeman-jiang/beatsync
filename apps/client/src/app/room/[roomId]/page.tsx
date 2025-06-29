import { NewSyncer } from "@/components/NewSyncer";
import { validateFullRoomId } from "@/lib/room";
import YouTubeSearch from "@/components/YouTubeSearch";
import YouTubePlayer from "@/components/YouTubePlayer";

export default async function Page({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  if (!validateFullRoomId(roomId)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <div>
          Invalid room ID: <span className="font-bold">{roomId}</span>.
        </div>
        <div className="text-sm text-gray-500">
          Please enter a valid 6-digit numeric code.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <NewSyncer roomId={roomId} />
      <YouTubeSearch />
      <YouTubePlayer />
    </div>
  );
}
