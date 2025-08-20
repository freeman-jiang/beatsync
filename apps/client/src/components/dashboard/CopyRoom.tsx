"use client";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { Check, Copy, Link, QrCode } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
// import { QRCodeCanvas } from "qrcode.react";
import QRCode from "react-qr-code";

import { useState } from "react";
import { toast } from "sonner";
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
      toast.error("Failed to copy room URL");
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
            <DialogDescription className="text-neutral-400 -mt-1.5 text-left">
              Scan QR code to join room {roomId}
            </DialogDescription>
          </DialogHeader>
          <Separator className="my-0 bg-neutral-800/50" />
          <div className="flex flex-col items-center space-y-4 pb-6">
            <div className="w-full lg:px-8">
              <div className="w-full h-full" style={{ height: "auto" }}>
                <QRCode
                  value={roomUrl}
                  size={256}
                  style={{ width: "100%", maxWidth: "100%", height: "auto" }}
                  viewBox="0 0 256 256"
                  fgColor="#ffffff"
                  bgColor="#000000"
                  className="rounded-lg"
                  level="M"
                />
              </div>
            </div>

            {/* Copy URL Button */}
            <button
              onClick={handleCopyUrl}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 border border-neutral-700/50 rounded-lg transition-all duration-200 group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="text-neutral-400">
                  <Link size={16} />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">
                    Room URL
                  </span>
                  <span className="text-sm font-mono text-white truncate max-w-[50vw]">
                    {roomUrl}
                  </span>
                </div>
              </div>
              <div className="relative w-4 h-4 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Check size={16} className="text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className="absolute inset-0 flex items-center justify-center text-neutral-400 group-hover:text-white transition-colors"
                    >
                      <Copy size={16} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
