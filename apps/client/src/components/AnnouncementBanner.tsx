"use client";

import { useState } from "react";
import { X } from "lucide-react";

export const AnnouncementBanner = () => {
  const [showBanner, setShowBanner] = useState(true);

  if (!showBanner) return null;

  return (
    <div className="bg-gradient-to-bl from-neutral-900 to-neutral-800 text-white fixed top-0 left-0 right-0 z-50">
      <div className="relative">
        <div className="container mx-auto px-4 py-3">
          <p className="text-xs sm:text-sm font-medium text-center">
            <span className="font-semibold">{"Jul 17, 2025: "}</span> Late
            joiners automatically sync with room audio and playlist.
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
