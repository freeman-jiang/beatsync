import { NewSyncer } from "@/components/NewSyncer";
import { DEMO_ROOM_ID, IS_DEMO_MODE } from "@/lib/demo";
import { validateFullRoomId } from "@/lib/room";
import { redirect } from "next/navigation";

// Force dynamic rendering and disable caching
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  if (IS_DEMO_MODE && roomId !== DEMO_ROOM_ID) {
    redirect("/");
  }

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

  return <NewSyncer roomId={roomId} />;
}
