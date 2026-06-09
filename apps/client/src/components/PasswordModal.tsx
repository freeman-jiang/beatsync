"use client";

import { checkRoomPassword } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, Lock, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PasswordModalProps {
  roomId: string;
  onVerified: () => void;
}

/**
 * Full-screen overlay that prompts for a 6-digit room PIN before joining.
 * Uses the same OTP-style input pattern as the room join screen.
 */
export const PasswordModal = ({ roomId, onVerified }: PasswordModalProps) => {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }, []);

  const handleVerify = useCallback(
    async (pin: string) => {
      if (pin.length !== 6) return;
      setIsChecking(true);
      setError(null);
      try {
        const { success } = await checkRoomPassword(roomId, pin);
        if (success) {
          sessionStorage.setItem(`room-password-${roomId}`, pin);
          onVerified();
        } else {
          setError("Incorrect PIN. Please try again.");
          triggerShake();
          setDigits(Array(6).fill(""));
          setTimeout(() => inputRefs.current[0]?.focus(), 50);
        }
      } catch {
        setError("Could not verify. Please try again.");
        triggerShake();
      } finally {
        setIsChecking(false);
      }
    },
    [roomId, onVerified, triggerShake]
  );

  const handleDigitChange = (index: number, value: string) => {
    // Allow only single digit (0-9)
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== "")) {
      const pin = newDigits.join("");
      void handleVerify(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = "";
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = "";
        setDigits(newDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newDigits = Array(6)
      .fill("")
      .map((_, i) => pasted[i] ?? "");
    setDigits(newDigits);
    if (pasted.length === 6) {
      void handleVerify(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 backdrop-blur-md px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Radial glow background */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative w-full max-w-sm"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl shadow-black/60">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            <motion.div
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Lock className="h-8 w-8 text-primary" />
            </motion.div>
          </div>

          {/* Heading */}
          <h1 className="mb-1 text-center text-xl font-semibold tracking-tight text-white">Private Room</h1>
          <p className="mb-6 text-center text-sm text-neutral-400">
            Enter the 6-digit PIN to join room <span className="font-mono font-medium text-neutral-200">{roomId}</span>
          </p>

          {/* PIN inputs */}
          <motion.div
            className="flex justify-center gap-2"
            animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
            transition={{ duration: 0.5 }}
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                id={`pin-digit-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={isChecking}
                className={cn(
                  "h-12 w-10 rounded-xl border text-center text-lg font-semibold",
                  "bg-neutral-800/80 text-white",
                  "transition-all duration-150 outline-none",
                  "focus:border-primary/70 focus:ring-2 focus:ring-primary/20",
                  error ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20" : "border-neutral-700",
                  isChecking && "opacity-50 cursor-not-allowed"
                )}
              />
            ))}
          </motion.div>

          {/* Error / loading feedback */}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                className="mt-4 flex items-center justify-center gap-1.5"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                <p className="text-center text-xs text-red-400">{error}</p>
              </motion.div>
            ) : isChecking ? (
              <motion.p
                key="checking"
                className="mt-4 text-center text-xs text-neutral-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Verifying…
              </motion.p>
            ) : (
              <motion.p
                key="hint"
                className="mt-4 text-center text-xs text-neutral-600"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <KeyRound className="mr-1 inline h-3 w-3" />
                Ask the room host for the PIN
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
