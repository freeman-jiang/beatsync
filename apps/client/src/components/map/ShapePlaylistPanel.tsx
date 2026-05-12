"use client";
// Side panel for map rooms: pick a shape on the left rail, manage its playlist
// on the right. Each shape's playlist lives in a server-side context (id =
// shape.id) and is mirrored client-side via PLAYLISTS_UPDATE → globalStore.
// playlists.get(shape.id). The same per-context WS actions
// (ADD_TRACK_TO_CONTEXT / REMOVE_TRACK_FROM_CONTEXT / PLAY / PAUSE / SET_CONTEXT_LOOP)
// the audio-room Queue/Player will eventually use, scoped here by shape.id.

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Pause, Play, Repeat, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ShapePlaylistPanelProps {
  canMutate: boolean;
}

export const ShapePlaylistPanel = ({ canMutate }: ShapePlaylistPanelProps) => {
  const shapes = useMapStore((s) => s.shapes);
  const shapesList = Array.from(shapes.values()).sort((a, b) => a.createdAt - b.createdAt);
  const proximityGains = useMapStore((s) => s.proximityGains);
  const playlists = useGlobalStore((s) => s.playlists);
  const isConnected = useGlobalStore((s) => s.socket?.readyState === WebSocket.OPEN);

  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");

  // Derive the effective selection without state-set-in-render — auto-fall to
  // the first shape when the selected one disappears or hasn't been picked.
  const effectiveSelectedId =
    selectedShapeId && shapes.has(selectedShapeId) ? selectedShapeId : (shapesList[0]?.id ?? null);

  function send(req: Parameters<typeof sendWSRequest>[0]["request"]) {
    const ws = useGlobalStore.getState().socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Not connected");
      return;
    }
    sendWSRequest({ ws, request: req });
  }

  const selectedShape = effectiveSelectedId ? shapes.get(effectiveSelectedId) : undefined;
  const selectedPlaylist = effectiveSelectedId ? playlists.get(effectiveSelectedId) : undefined;
  const tracks = selectedPlaylist?.tracks ?? [];
  const playback = selectedPlaylist?.playbackState;
  const isPlaying = playback?.type === "playing";

  return (
    <aside className="flex h-full w-full flex-col border-l border-neutral-800 bg-neutral-950/95 text-neutral-100 backdrop-blur">
      <header className="border-b border-neutral-800 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">Zones</h2>
        <p className="text-[11px] text-neutral-400">
          {canMutate
            ? "Draw on the map to add a zone. Select one to manage its playlist."
            : "You're a visitor — drag your marker to move around."}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {shapesList.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
            No zones yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {shapesList.map((shape) => {
              const isSelected = shape.id === effectiveSelectedId;
              const gain = proximityGains.get(shape.id) ?? 0;
              const shapePlaylist = playlists.get(shape.id);
              const trackCount = shapePlaylist?.tracks.length ?? 0;
              const playing = shapePlaylist?.playbackState.type === "playing";
              return (
                <li key={shape.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedShapeId(shape.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                      isSelected
                        ? "border-green-700 bg-green-900/20"
                        : "border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-neutral-100">
                        {shape.id.slice(0, 8)} <span className="text-neutral-500">· {shape.type}</span>
                      </span>
                      {playing && <Play className="size-3 text-green-400" />}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {trackCount} track{trackCount === 1 ? "" : "s"} · audible @ {shape.audibleRadiusMeters}m · gain{" "}
                      {gain.toFixed(2)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedShape && (
        <div className="border-t border-neutral-800 p-2 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              Playlist for <span className="text-neutral-200">{selectedShape.id.slice(0, 8)}</span>
            </span>
            {canMutate && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`h-6 px-1 text-[10px] ${selectedPlaylist?.loop ? "text-green-400" : "text-neutral-500"}`}
                title={selectedPlaylist?.loop ? "Looping" : "Not looping"}
                onClick={() =>
                  send({
                    type: ClientActionEnum.enum.SET_CONTEXT_LOOP,
                    contextId: selectedShape.id,
                    loop: !selectedPlaylist?.loop,
                  })
                }
              >
                <Repeat className="size-3" />
              </Button>
            )}
          </div>

          {/* Track list — click to play, × to remove */}
          {tracks.length > 0 ? (
            <ul className="mb-2 space-y-0.5">
              {tracks.map((track) => {
                const isCurrent = isPlaying && playback?.audioSource === track.url;
                return (
                  <li
                    key={track.url}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                      isCurrent ? "bg-neutral-800/70" : "hover:bg-neutral-900"
                    }`}
                  >
                    {canMutate ? (
                      <button
                        type="button"
                        title="Play this track"
                        className="min-w-0 flex-1 truncate text-left text-[10px] text-neutral-300"
                        onClick={() =>
                          send({
                            type: ClientActionEnum.enum.PLAY,
                            contextId: selectedShape.id,
                            audioSource: track.url,
                            trackTimeSeconds: 0,
                          })
                        }
                      >
                        {isCurrent && <Play className="mr-1 inline size-2.5 text-green-400" />}
                        {track.url.split("/").pop() || track.url}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-400">
                        {track.url.split("/").pop() || track.url}
                      </span>
                    )}
                    {canMutate && (
                      <button
                        type="button"
                        className="text-neutral-500 hover:text-red-400"
                        title="Remove from playlist"
                        onClick={() =>
                          send({
                            type: ClientActionEnum.enum.REMOVE_TRACK_FROM_CONTEXT,
                            contextId: selectedShape.id,
                            url: track.url,
                          })
                        }
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mb-2 rounded border border-dashed border-neutral-800 p-2 text-center text-[10px] text-neutral-500">
              No tracks yet.
            </div>
          )}

          {canMutate && (
            <div className="mb-2 flex gap-1">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://… audio URL"
                disabled={!isConnected}
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={!urlInput.trim() || !isConnected}
                onClick={() => {
                  const url = urlInput.trim();
                  send({
                    type: ClientActionEnum.enum.ADD_TRACK_TO_CONTEXT,
                    contextId: selectedShape.id,
                    source: { url },
                  });
                  setUrlInput("");
                }}
              >
                Add
              </Button>
            </div>
          )}

          {canMutate && (
            <div className="flex gap-1">
              {!isPlaying && tracks.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 flex-1 text-[11px]"
                  disabled={!isConnected}
                  onClick={() => {
                    // Resume the current track, or start the first one if nothing is selected.
                    const target = playback?.audioSource || tracks[0]?.url;
                    if (!target) return;
                    send({
                      type: ClientActionEnum.enum.PLAY,
                      contextId: selectedShape.id,
                      audioSource: target,
                      trackTimeSeconds: playback?.trackPositionSeconds ?? 0,
                    });
                  }}
                >
                  <Play className="mr-1 size-3" /> Play
                </Button>
              )}
              {isPlaying && playback && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 flex-1 text-[11px]"
                  disabled={!isConnected}
                  onClick={() =>
                    send({
                      type: ClientActionEnum.enum.PAUSE,
                      contextId: selectedShape.id,
                      audioSource: playback.audioSource,
                      trackTimeSeconds: 0,
                    })
                  }
                >
                  <Pause className="mr-1 size-3" /> Pause
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-950/30"
                disabled={!isConnected}
                onClick={() => send({ type: ClientActionEnum.enum.DELETE_SHAPE, shapeId: selectedShape.id })}
                aria-label="Delete zone"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
