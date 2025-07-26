import { PostHogProvider } from "@/components/PostHogProvider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import TQProvider from "@/components/TQProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Beatsync",
  description:
    "Beatsync is an open-source, web audio player built for multi-device playback.",
  keywords: ["music", "sync", "audio", "collaboration", "real-time"],
  authors: [{ name: "Freeman Jiang" }],
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          inter.variable,
          "antialiased font-sans dark selection:bg-primary-800 selection:text-white"
        )}
      >
        <PostHogProvider>
          <TQProvider>
            {children}
            <Toaster />
            <Analytics />
          </TQProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
