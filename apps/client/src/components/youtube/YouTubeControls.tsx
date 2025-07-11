"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { YouTubeUrlInput } from "./YouTubeUrlInput";
import { AlertTriangle, Youtube } from "lucide-react";

export const YouTubeControls = () => {
  return (
    <Card className="bg-red-950/20 border-red-800/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-red-400">
          <Youtube className="h-4 w-4" />
          <span className="text-sm">YouTube</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-md">
          <p className="text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={12} />
            <span>Synced across all devices</span>
          </p>
        </div>
        
        {/* URL Input */}
        <div>
          <YouTubeUrlInput />
        </div>

        <div className="text-xs text-neutral-500 text-center pt-1">
          Add videos and manage playback in the main area
        </div>
      </CardContent>
    </Card>
  );
};
