"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface LoadDefaultTracksButtonProps {
  className?: string;
}

export const LoadDefaultTracksButton = ({
  className,
}: LoadDefaultTracksButtonProps) => {
  const socket = useGlobalStore((s) => s.socket);
  const audioSources = useGlobalStore((s) => s.audioSources);

  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop loading when queue is populated
  useEffect(() => {
    if (isLoading && audioSources.length > 0) {
      // Use queueMicrotask to avoid synchronous setState in effect body
      queueMicrotask(() => {
        setIsLoading(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      });
    }
  }, [audioSources.length, isLoading]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!socket || isLoading) return;
    setIsLoading(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsLoading(false), 6000);

    sendWSRequest({
      ws: socket,
      request: { type: ClientActionEnum.enum.LOAD_DEFAULT_TRACKS },
    });
  };

  return (
    <motion.button
      className={cn(
        "relative inline-flex items-center justify-center px-5 py-2 bg-primary text-primary-foreground rounded-full",
        "font-medium text-xs tracking-wide cursor-pointer",
        "hover:shadow-lg hover:shadow-zinc-50/50 transition-shadow duration-500",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <motion.circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                className="text-primary-foreground"
                strokeDasharray={2 * Math.PI * 35 * 0.25}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "center" }}
              />
            </svg>
          </div>
        </div>
      )}
      <span className={cn(isLoading ? "opacity-0" : "opacity-100")}>
        Load default tracks
      </span>
    </motion.button>
  );
};

export default LoadDefaultTracksButton;
