"use client";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { Check, Copy, Link, QrCode } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import QRCodeLib from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Separator } from "../ui/separator";

const IS_SECURE_CONTEXT = typeof window !== "undefined" && window.isSecureContext;

export const RoomQRCode = () => {
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const roomId = useRoomStore((state) => state.roomId);
  const roomUrl = (() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.delete("admin");
    return url.toString();
  })();

  // Generate QR code when dialog opens
  useEffect(() => {
    if (qrDialogOpen && roomUrl) {
      QRCodeLib.toDataURL(
        roomUrl,
        {
          margin: 0,
          color: {
            dark: "#ffffff",
            light: "#00000000", // transparent background
          },
          errorCorrectionLevel: "M",
          scale: 40,
        },
        (err, url) => {
          if (!err) {
            setQrCodeDataUrl(url);
          }
        }
      );
    }
  }, [qrDialogOpen, roomUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context — clipboard API unavailable
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
            {/* <DialogDescription className="text-neutral-400 -mt-1.5 text-left">
              Scan QR code to join room {roomId}
            </DialogDescription> */}
          </DialogHeader>
          <Separator className="my-0 bg-neutral-800/50" />
          <div className="flex flex-col items-center space-y-6 pb-6">
            {/* Domain and Room Code Display */}
            <div className="w-full text-center space-y-2">
              <div className="text-3xl font-semibold text-white">beatsync.gg</div>

              <div className="text-3xl font-bold text-white bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-8 py-2 inline-block">
                {roomId}
              </div>
            </div>

            <div className="relative">
              <div className="text-neutral-400 text-xs text-center mb-2">OR SCAN</div>
              <div className="w-full lg:px-8">
                <div className="w-full h-full" style={{ height: "auto" }}>
                  {qrCodeDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL from QR code generation, not a remote image
                    <img src={qrCodeDataUrl} alt="Room QR Code" className="w-full h-full" />
                  )}
                </div>
              </div>
            </div>

            {/* Copy URL — button on HTTPS, selectable text on HTTP */}
            {IS_SECURE_CONTEXT ? (
              <button
                onClick={handleCopyUrl}
                className="w-full flex items-center justify-between px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 border border-neutral-700/50 rounded-lg transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="text-neutral-400">
                    <Link size={16} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-neutral-500 uppercase tracking-wide">Full URL</span>
                    <span className="text-sm font-mono text-white truncate max-w-[50vw]">{roomUrl}</span>
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
            ) : (
              <div className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Link size={16} className="text-neutral-400 shrink-0" />
                  <span className="text-sm font-mono text-white select-all break-all">{roomUrl}</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
