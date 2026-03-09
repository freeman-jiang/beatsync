"use client";

import { getClientId } from "@/lib/clientId";
import { usePathname, useSearchParams } from "next/navigation";
import type { PostHog } from "posthog-js";
import { createContext, Suspense, useContext, useEffect, useRef, useState } from "react";

const PostHogContext = createContext<PostHog | null>(null);

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [posthog, setPosthog] = useState<PostHog | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    initRef.current = true;

    import("posthog-js").then((mod) => {
      const ph = mod.default;
      ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: "/relay-OsR8",
        ui_host: "https://us.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        capture_performance: false,
        capture_heatmaps: false,
      });

      const clientId = getClientId();
      ph.identify(clientId);
      setPosthog(ph);
    });
  }, []);

  return (
    <PostHogContext.Provider value={posthog}>
      {posthog && (
        <Suspense fallback={null}>
          <PostHogPageView />
        </Suspense>
      )}
      {children}
    </PostHogContext.Provider>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = useContext(PostHogContext);

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) {
        url += "?" + search;
      }
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}
