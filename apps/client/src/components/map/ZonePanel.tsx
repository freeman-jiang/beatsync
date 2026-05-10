"use client";
// Side panel: lists every shape with curator controls (add audio source URL, play,
// pause, delete) and visitor info (playback state). Read-only for non-admins.

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { sendWSRequest } from "@/utils/ws";
import type { ShapeStateType } from "@beatsync/shared";
import { ClientActionEnum } from "@beatsync/shared";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ZonePanelProps {
  canMutate: boolean;
}

export const ZonePanel = ({ canMutate }: ZonePanelProps) => {
  const shapes = useMapStore((s) => s.shapes);
  const shapesList = Array.from(shapes.values()).sort((a, b) => a.shape.createdAt - b.shape.createdAt);

  return (
    <aside className="flex h-full w-full flex-col border-l border-neutral-800 bg-neutral-950/95 text-neutral-100 backdrop-blur">
      <header className="border-b border-neutral-800 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">Zones</h2>
        <p className="text-[11px] text-neutral-400">
          {canMutate
            ? "Draw on the map to add a zone. Click a zone to manage its playlist."
            : "You're a visitor — drag your marker to move around."}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {shapesList.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
            No zones yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {shapesList.map((state) => (
              <ZoneCard key={state.shape.id} state={state} canMutate={canMutate} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};

function ZoneCard({ state, canMutate }: { state: ShapeStateType; canMutate: boolean }) {
  const proximityGain = useMapStore((s) => s.proximityGains.get(state.shape.id) ?? 0);
  const [audioUrl, setAudioUrl] = useState("");
  const { shape, playlist, playbackState } = state;
  const isPlaying = playbackState.type === "playing";
  const currentTrack = playlist[playbackState.trackIndex];

  function send(req: Parameters<typeof sendWSRequest>[0]["request"]) {
    const ws = useGlobalStore.getState().socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Not connected");
      return;
    }
    sendWSRequest({ ws, request: req });
  }

  return (
    <li className="rounded border border-neutral-800 bg-neutral-900/70 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-neutral-100">
            {shape.id.slice(0, 8)} <span className="text-neutral-500">· {shape.type}</span>
          </div>
          <div className="text-[10px] text-neutral-500">
            {playlist.length} track(s) · audible @ {shape.audibleRadiusMeters}m{" · "}gain {proximityGain.toFixed(2)}
          </div>
        </div>
        {canMutate && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-neutral-400 hover:text-red-400"
            onClick={() => send({ type: ClientActionEnum.enum.DELETE_SHAPE, shapeId: shape.id })}
            aria-label="Delete zone"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {playlist.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-neutral-800 pt-2">
          {playlist.map((src, i) => (
            <li
              key={src.url + i}
              className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 ${
                currentTrack?.url === src.url && isPlaying ? "bg-neutral-800/60" : ""
              }`}
            >
              <span className="truncate text-[10px] text-neutral-300">{src.url}</span>
              {canMutate && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 shrink-0 p-0 text-neutral-400 hover:text-red-400"
                  onClick={() =>
                    send({
                      type: ClientActionEnum.enum.REMOVE_SHAPE_AUDIO_SOURCES,
                      shapeId: shape.id,
                      urls: [src.url],
                    })
                  }
                  aria-label="Remove track"
                >
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canMutate && (
        <div className="mt-2 flex gap-1">
          <input
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://… audio URL"
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={!audioUrl.trim()}
            onClick={() => {
              send({
                type: ClientActionEnum.enum.ADD_SHAPE_AUDIO_SOURCE,
                shapeId: shape.id,
                source: { url: audioUrl.trim() },
              });
              setAudioUrl("");
            }}
          >
            <Plus className="size-3" />
          </Button>
        </div>
      )}

      {canMutate && playlist.length > 0 && (
        <div className="mt-2 flex gap-1">
          {!isPlaying ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 flex-1 text-[11px]"
              onClick={() => {
                const target = currentTrack ?? playlist[0];
                send({
                  type: ClientActionEnum.enum.PLAY,
                  shapeId: shape.id,
                  audioSource: target.url,
                  trackTimeSeconds: playbackState.trackPositionSeconds || 0,
                });
              }}
            >
              <Play className="mr-1 size-3" /> Play
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 flex-1 text-[11px]"
              onClick={() =>
                send({
                  type: ClientActionEnum.enum.PAUSE,
                  shapeId: shape.id,
                  audioSource: playbackState.audioSource,
                  trackTimeSeconds: 0,
                })
              }
            >
              <Pause className="mr-1 size-3" /> Pause
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
