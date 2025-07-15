"use client";
import { Join } from "@/components/Join";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useEffect } from "react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

export default function Home() {
  const resetGlobalStore = useGlobalStore((state) => state.resetStore);
  const resetRoomStore = useRoomStore((state) => state.reset);

  useEffect(() => {
    console.log("resetting stores");
    // Reset both stores when the main page is loaded
    resetGlobalStore();
    resetRoomStore();
  }, [resetGlobalStore, resetRoomStore]);

  return (
    <>
      <Join />
      <AnnouncementBanner />
    </>
  );
}
