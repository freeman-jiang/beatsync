"use client";
import { Join } from "@/components/Join";
import { DEMO_ROOM_ID, IS_DEMO_MODE } from "@/lib/demo";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const resetGlobalStore = useGlobalStore((state) => state.resetStore);
  const resetRoomStore = useRoomStore((state) => state.reset);
  const resetChatStore = useChatStore((state) => state.reset);
  const router = useRouter();

  useEffect(() => {
    if (IS_DEMO_MODE) {
      router.replace(`/room/${DEMO_ROOM_ID}`);
      return;
    }
    console.log("resetting stores");
    // Reset all stores when the main page is loaded
    resetGlobalStore();
    resetRoomStore();
    resetChatStore();
  }, [resetGlobalStore, resetRoomStore, resetChatStore, router]);

  if (IS_DEMO_MODE) {
    return null;
  }

  return <Join />;
}
