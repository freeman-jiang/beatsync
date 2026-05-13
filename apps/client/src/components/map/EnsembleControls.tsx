"use client";
// Bottom-bar transport for map rooms. Treats every shape's playlist as part of
// one synchronized installation: Play All starts every playlist that has at
// least one track; Pause All stops every currently-playing context. No
// skip/shuffle — those are per-context concerns and live in the per-shape
// queue (clicking a track).

import { Button } from "@/components/ui/button";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, MAIN_CONTEXT_ID } from "@beatsync/shared";
import { Pause, Play, Square } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

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

  const disabled = !canMutate || !isConnected || totalWithTracks === 0;

  const playAll = () => {
    const socket = useGlobalStore.getState().socket;
    if (!socket) return;
    let started = 0;
    for (const p of playlists.values()) {
      if (p.id === MAIN_CONTEXT_ID) continue;
      if (p.tracks.length === 0) continue;
      if (p.playbackState.type === "playing") continue;
      // Resume the current track if one is set, otherwise start the first track.
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
      started++;
    }
    if (started === 0) toast.info("Every zone is already playing");
  };

  const pauseAll = () => {
    const socket = useGlobalStore.getState().socket;
    if (!socket) return;
    let stopped = 0;
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
      stopped++;
    }
    if (stopped === 0) toast.info("Nothing is playing");
  };

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="text-xs text-neutral-400">
        {totalWithTracks === 0
          ? "Draw a zone and add audio to start"
          : `${playingCount} of ${totalWithTracks} zone${totalWithTracks === 1 ? "" : "s"} playing`}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="default" onClick={playAll} disabled={disabled} className="h-8 px-3 text-xs">
          <Play className="mr-1 size-3.5" /> Play all
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={pauseAll}
          disabled={!canMutate || !isConnected || playingCount === 0}
          className="h-8 px-3 text-xs"
        >
          {playingCount === 0 ? <Square className="mr-1 size-3.5" /> : <Pause className="mr-1 size-3.5" />}
          Pause all
        </Button>
      </div>
    </div>
  );
};
