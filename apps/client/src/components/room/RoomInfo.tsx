"use client";
import { useClientId } from "@/hooks/useClientId";
import { useRoomStore } from "@/store/room";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export const RoomInfo = () => {
  // Get room information directly from the store
  const roomId = useRoomStore((state) => state.roomId);
  const username = useRoomStore((state) => state.username);
  const { clientId } = useClientId();

  return (
    <Card className="w-full md:w-2/3">
      <CardHeader>
        <CardTitle>Room Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Room ID</span>
            <span className="font-medium">{roomId}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="font-medium">{username}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">User ID</span>
            <span className="font-medium truncate">{clientId}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
