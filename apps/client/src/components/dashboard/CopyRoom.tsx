"use client";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { Check, Copy, QrCode } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
  const roomId = useRoomStore((state) => state.roomId);
  const roomUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
          <div className="flex flex-col items-center space-y-4 pb-6">
            <div className="w-full h-full px-12">
              <QRCodeSVG
                value={roomUrl}
                bgColor="transparent"
                fgColor="#ffffff"
                className="w-full h-full rounded-lg"
                level="M"
              />
            </div>

            {/* Copy URL Button */}
            <button
              onClick={handleCopyUrl}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 border border-neutral-700/50 rounded-lg transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <div className="text-neutral-400">
                  <QrCode size={16} />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">
                    Room Code
                  </span>
                  <span className="text-sm font-mono text-white">{roomId}</span>
                </div>
              </div>
              <div className="text-neutral-400 group-hover:text-white transition-colors">
                {copied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} />
                )}
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
