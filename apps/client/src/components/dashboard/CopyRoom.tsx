"use client";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Separator } from "../ui/separator";

export const RoomQRCode = () => {
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const roomId = useRoomStore((state) => state.roomId);
  const roomUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <>
      <button
        className={cn(
          "cursor-pointer flex items-center gap-1 text-neutral-400 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded-sm"
        )}
        onClick={() => setQrDialogOpen(true)}
        type="button"
        aria-label="Show room QR code"
      >
        <QrCode size={16} />
        <span className="text-sm font-medium">QR</span>
      </button>
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="backdrop-blur-md bg-neutral-900/80 border border-neutral-800/60 shadow-xl rounded-xl transition-all duration-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-medium">
              <QrCode size={18} className="text-neutral-400" />
              Share Beatsync Room
            </DialogTitle>
            <DialogDescription className="text-neutral-400 -mt-1.5">
              Scan QR code to join room {roomId}
            </DialogDescription>
          </DialogHeader>
          <Separator className="my-0 bg-neutral-800/50" />
          <div className="px-6 pb-8">
            <QRCodeSVG
              className="w-full h-full"
              value={roomUrl}
              bgColor="transparent"
              fgColor="#ffffff"
            />
            <div className="text-xs text-neutral-400 break-all text-center mt-2">
              {roomUrl}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
