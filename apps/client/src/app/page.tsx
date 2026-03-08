"use client";
import { Join } from "@/components/Join";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DEMO_ROOM = process.env.NEXT_PUBLIC_DEMO_ROOM;

export default function Home() {
  const router = useRouter();
  const resetGlobalStore = useGlobalStore((state) => state.resetStore);
  const resetRoomStore = useRoomStore((state) => state.reset);
  const resetChatStore = useChatStore((state) => state.reset);

  useEffect(() => {
    if (DEMO_ROOM) {
      router.replace(`/room/${DEMO_ROOM}`);
      return;
    }
    console.log("resetting stores");
    // Reset all stores when the main page is loaded
    resetGlobalStore();
    resetRoomStore();
    resetChatStore();
  }, [router, resetGlobalStore, resetRoomStore, resetChatStore]);

  if (DEMO_ROOM) return null;

  return (
    <>
      <Join />
    </>
  );
}
