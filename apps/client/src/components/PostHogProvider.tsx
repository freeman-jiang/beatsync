"use client";

import { getClientId } from "@/lib/clientId";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: "/relay-OsR8",
        ui_host: "https://us.posthog.com",
        autocapture: false, // Disable auto-capture of clicks, forms, inputs
        capture_pageview: false, // We capture pageviews manually
        capture_pageleave: true, // Enable pageleave capture
        capture_performance: false, // Enable web vitals capture,
        capture_heatmaps: false,
        // debug: process.env.NODE_ENV === "development",
      });

      // Identify the user with their persistent client ID
      const clientId = getClientId();
      posthog.identify(clientId);
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

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

function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
