"use client";
// Bottom-bar transport for map rooms. Treats every shape's playlist as part of
// one synchronized installation, with a single toggle:
//
//   - If anything is playing → button shows "Pause all" and pauses every
//     currently-playing context.
//   - Otherwise → button shows "Play all" and starts every playlist that has
//     at least one track (resuming the current track if one is set, else
//     starting the first track).
//
// No skip/shuffle — those are per-context concerns and live in the per-shape
// queue (clicking a track).

import { Button } from "@/components/ui/button";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, MAIN_CONTEXT_ID } from "@beatsync/shared";
import { Pause, Play } from "lucide-react";
import { useMemo } from "react";

export const EnsembleControls = () => {
  const canMutate = useCanMutate();
  const playlists = useGlobalStore((s) => s.playlists);
  const isConnected = useGlobalStore((s) => s.socket?.readyState === WebSocket.OPEN);

  // Derive counts across every non-main context. Main is the back-compat audio-
  // room playlist and is empty in map rooms anyway.
  const { playingCount, totalWithTracks } = useMemo(() => {
    let playing = 0;
    let withTracks = 0;
    for (const p of playlists.values()) {
      if (p.id === MAIN_CONTEXT_ID) continue;
      if (p.tracks.length > 0) withTracks++;
      if (p.playbackState.type === "playing") playing++;
    }
    return { playingCount: playing, totalWithTracks: withTracks };
  }, [playlists]);

  const anyPlaying = playingCount > 0;
  const disabled = !canMutate || !isConnected || totalWithTracks === 0;

  const toggle = () => {
    const socket = useGlobalStore.getState().socket;
    if (!socket) return;
    if (anyPlaying) {
      for (const p of playlists.values()) {
        if (p.id === MAIN_CONTEXT_ID) continue;
        if (p.playbackState.type !== "playing") continue;
        sendWSRequest({
          ws: socket,
          request: {
            type: ClientActionEnum.enum.PAUSE,
            contextId: p.id,
            audioSource: p.playbackState.audioSource,
            trackTimeSeconds: 0,
          },
        });
      }
    } else {
      for (const p of playlists.values()) {
        if (p.id === MAIN_CONTEXT_ID) continue;
        if (p.tracks.length === 0) continue;
        const audioSource = p.playbackState.audioSource || p.tracks[0].url;
        const trackTimeSeconds = p.playbackState.audioSource ? p.playbackState.trackPositionSeconds : 0;
        sendWSRequest({
          ws: socket,
          request: {
            type: ClientActionEnum.enum.PLAY,
            contextId: p.id,
            audioSource,
            trackTimeSeconds,
          },
        });
      }
    }
  };

  return (
    // Right-align the entire row so the bottom-left corner stays free for the
    // Next.js dev overlay (which would otherwise cover the status text).
    <div className="flex w-full items-center justify-end gap-3">
      <div className="text-xs text-neutral-400">
        {totalWithTracks === 0
          ? "Draw a zone and add audio to start"
          : `${playingCount} of ${totalWithTracks} zone${totalWithTracks === 1 ? "" : "s"} playing`}
      </div>
      <Button
        size="sm"
        variant={anyPlaying ? "secondary" : "default"}
        onClick={toggle}
        disabled={disabled}
        className="h-8 px-3 text-xs"
      >
        {anyPlaying ? (
          <>
            <Pause className="mr-1 size-3.5" /> Pause all
          </>
        ) : (
          <>
            <Play className="mr-1 size-3.5" /> Play all
          </>
        )}
      </Button>
    </div>
  );
};
