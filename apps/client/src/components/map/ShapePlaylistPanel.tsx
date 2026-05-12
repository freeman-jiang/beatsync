"use client";
// Side panel for map rooms: select a shape on the left rail, see/manage its
// playlist on the right. Uses the unified per-context WS protocol — every
// action carries contextId = selected shape.id, hitting the same server-side
// playlist primitive the audio room uses.
//
// This panel is intentionally minimal for the MVP migration. As beatsync's
// Queue / Player / AudioUploaderMinimal components are themselves
// parameterized by contextId in a follow-up, those can drop in here verbatim
// and replace the paste-URL + play/pause controls below.

import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ShapePlaylistPanelProps {
  canMutate: boolean;
}

export const ShapePlaylistPanel = ({ canMutate }: ShapePlaylistPanelProps) => {
  const shapes = useMapStore((s) => s.shapes);
  const shapesList = Array.from(shapes.values()).sort((a, b) => a.createdAt - b.createdAt);
  const proximityGains = useMapStore((s) => s.proximityGains);
  const audioSources = useGlobalStore((s) => s.audioSources);
  const isConnected = useGlobalStore((s) => s.socket?.readyState === WebSocket.OPEN);

  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");

  // Auto-select the first shape when shapes appear (or the previously selected
  // disappears). Derive the effective selection without a state-set in render so
  // we don't trigger cascading renders.
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

  // For now, audio-room playlist tracks live in globalStore.audioSources. Each
  // shape's playlist is a separate context on the server; per-shape track UI
  // will arrive once the client store mirrors all contexts (follow-up).
  // Visible MVP: paste an audio URL, play it for the selected shape.

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
                    <div className="truncate font-medium text-neutral-100">
                      {shape.id.slice(0, 8)} <span className="text-neutral-500">· {shape.type}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      audible @ {shape.audibleRadiusMeters}m · gain {gain.toFixed(2)}
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
          <div className="mb-2 text-[11px] text-neutral-400">
            Playlist for <span className="text-neutral-200">{selectedShape.id.slice(0, 8)}</span>
          </div>

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
                  // Add to the room-level audioSources via the same /upload/complete
                  // endpoint the audio room uses for paste-URL adds (in
                  // AudioUploaderMinimal). Skipping that here for simplicity — the
                  // PLAY message names the URL directly; the server validates it
                  // against the relevant playlist context's tracks. A follow-up will
                  // wire the per-shape ADD_AUDIO_SOURCE path through the unified
                  // protocol.
                  send({
                    type: ClientActionEnum.enum.PLAY,
                    contextId: selectedShape.id,
                    audioSource: url,
                    trackTimeSeconds: 0,
                  });
                  setUrlInput("");
                }}
              >
                <Play className="size-3" />
              </Button>
            </div>
          )}

          {canMutate && (
            <div className="flex gap-1">
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
                    audioSource: "",
                    trackTimeSeconds: 0,
                  })
                }
              >
                <Pause className="mr-1 size-3" /> Pause
              </Button>
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

          {/* Room-level audio sources (audio-room queue). For a quick MVP that
              wires per-shape playlists into the same queue/player UI, we surface
              the room-level audio sources here as candidates the curator can
              point a shape's playlist at. Follow-up: per-context track storage
              on the client + Queue parameterized by contextId. */}
          {audioSources.length > 0 && canMutate && (
            <div className="mt-2 border-t border-neutral-800 pt-2">
              <div className="mb-1 text-[10px] text-neutral-500">Room tracks (click to play here)</div>
              <ul className="space-y-1">
                {audioSources.map((src) => (
                  <li key={src.source.url}>
                    <button
                      type="button"
                      onClick={() =>
                        send({
                          type: ClientActionEnum.enum.PLAY,
                          contextId: selectedShape.id,
                          audioSource: src.source.url,
                          trackTimeSeconds: 0,
                        })
                      }
                      className="block w-full rounded px-1 py-0.5 text-left text-[10px] text-neutral-300 hover:bg-neutral-800/60"
                    >
                      <Plus className="mr-1 inline size-2.5" />
                      {src.source.url.split("/").pop() ?? src.source.url}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
