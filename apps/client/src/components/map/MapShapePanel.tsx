"use client";
// Per-shape playlist column for the map dashboard. Sits next to the map in the
// center area and renders the SAME Queue/Uploader components audio rooms use,
// scoped to the currently-selected shape's playlist context (contextId = shape.id).
//
// What lives here:
//   - Header with shape title, loop toggle, delete-shape button
//   - AudioUploaderMinimal pinned ABOVE the queue (contextId-scoped upload)
//   - Queue, parameterized by contextId == shape.id
//
// What does NOT live here:
//   - Map rendering — MapCanvas
//   - Ensemble play/pause — EnsembleControls in the bottom bar
//   - Chat / user list — those still live in Right / Left

import { AudioUploaderMinimal } from "@/components/AudioUploaderMinimal";
import { Queue } from "@/components/Queue";
import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Repeat, Trash2 } from "lucide-react";

interface MapShapePanelProps {
  canMutate: boolean;
}

export const MapShapePanel = ({ canMutate }: MapShapePanelProps) => {
  const shapes = useMapStore((s) => s.shapes);
  const selectedShapeId = useMapStore((s) => s.selectedShapeId);
  const playlist = useGlobalStore((s) => (selectedShapeId ? s.playlists.get(selectedShapeId) : undefined));
  const isConnected = useGlobalStore((s) => s.socket?.readyState === WebSocket.OPEN);

  const shape = selectedShapeId ? shapes.get(selectedShapeId) : undefined;

  if (!shape) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-neutral-500">
        <div>Select a zone on the map to edit its playlist.</div>
        {shapes.size === 0 && canMutate && (
          <div className="text-neutral-600">Draw one with the toolbar in the top-left of the map.</div>
        )}
      </div>
    );
  }

  const send = (req: Parameters<typeof sendWSRequest>[0]["request"]) => {
    const socket = useGlobalStore.getState().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    sendWSRequest({ ws: socket, request: req });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800/50 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-100">Zone {shape.id.slice(0, 6)}</div>
          <div className="text-[11px] text-neutral-500">
            {shape.type} · audible @ {shape.audibleRadiusMeters}m
          </div>
        </div>
        {canMutate && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={`h-7 px-1.5 ${playlist?.loop ? "text-green-400" : "text-neutral-500"}`}
              title={playlist?.loop ? "Looping zone" : "Not looping"}
              disabled={!isConnected}
              onClick={() =>
                send({
                  type: ClientActionEnum.enum.SET_CONTEXT_LOOP,
                  contextId: shape.id,
                  loop: !playlist?.loop,
                })
              }
            >
              <Repeat className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-neutral-500 hover:text-red-400"
              title="Delete zone"
              disabled={!isConnected}
              onClick={() => send({ type: ClientActionEnum.enum.DELETE_SHAPE, shapeId: shape.id })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Uploader pinned above the queue */}
      {canMutate && (
        <div className="px-3 pt-3">
          <AudioUploaderMinimal contextId={shape.id} label={`Upload to ${shape.id.slice(0, 6)}`} />
        </div>
      )}

      {/* Queue (scrollable) */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20">
        <Queue contextId={shape.id} />
      </div>
    </div>
  );
};
