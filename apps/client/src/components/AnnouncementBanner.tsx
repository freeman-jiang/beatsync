"use client";

import { X } from "lucide-react";
import { useState } from "react";

export const AnnouncementBanner = () => {
  const [showBanner, setShowBanner] = useState(true);

  if (!showBanner) return null;

  return (
    <div className="bg-gradient-to-bl from-neutral-900 to-neutral-800 text-white">
      <div className="relative">
        <div className="container mx-auto px-4 py-3">
          <p className="text-xs sm:text-sm font-medium text-center">
            <span className="font-semibold">{"Nov 6, 2025: "}</span>
            Add ability to reorder the music queue.
            {/* <a
              href="#"
              className="ml-3 inline-flex items-center text-white underline hover:no-underline font-semibold"
            >
              Learn More
              <svg
                className="ml-1 w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a> */}
          </p>
        </div>
        <button
          onClick={() => setShowBanner(false)}
          className="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-700/50 rounded-md transition-colors"
          aria-label="Close announcement"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
