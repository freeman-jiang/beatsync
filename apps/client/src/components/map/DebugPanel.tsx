"use client";
// Map-room debug rows: per-shape current playback position vs the server's intended
// position at the current moment. Designed to be slotted INSIDE the top-middle header
// chip in MapRoom — no absolute positioning of its own.
//
// "current"   — where THIS tab's source is playing right now (mod buffer duration)
// "intended"  — where the SERVER says the position should be at this server-time
// "drift"     — current − intended (positive = ahead of server, negative = behind)
//
// Two tabs should match on "intended" exactly (NTP-corrected server time is the same).
// Difference in "current" between tabs == audible drift.

import { mapAudio, type ShapePlaybackDebug } from "@/lib/mapAudio";
import { useEffect, useState } from "react";

const POLL_MS = 200;

export const DebugPanel = () => {
  const [info, setInfo] = useState<ShapePlaybackDebug[]>([]);

  useEffect(() => {
    const tick = () => setInfo(mapAudio.getDebugInfo());
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-1 border-t border-neutral-800 pt-1 font-mono text-[10px]">
      {info.length === 0 && <div className="text-neutral-500">no active shape audio yet</div>}
      {info.map((s) => (
        <div key={s.shapeId} className="mt-0.5 first:mt-0">
          <div className="font-semibold">
            {s.shapeId.slice(0, 8)}{" "}
            <span
              className={
                !s.isPlaying
                  ? "text-neutral-500"
                  : s.lastSchedule?.path === "late"
                    ? "text-amber-400"
                    : "text-green-400"
              }
            >
              {s.isPlaying ? `▶ ${s.lastSchedule?.path}` : "❚❚"}
            </span>
            {s.bufferDuration !== undefined && (
              <span className="text-neutral-500"> · dur {s.bufferDuration.toFixed(2)}s</span>
            )}
          </div>
          {s.currentPosition !== undefined && (
            <>
              <div className="text-neutral-300">
                cur <span className="text-cyan-300">{s.currentPosition.toFixed(3)}s</span>
                {"  "}int <span className="text-cyan-300">{s.intendedPosition?.toFixed(3)}s</span>
                {"  "}drift{" "}
                <span
                  className={
                    Math.abs(s.driftSeconds ?? 0) < 0.02
                      ? "text-green-400"
                      : Math.abs(s.driftSeconds ?? 0) < 0.15
                        ? "text-amber-400"
                        : "text-red-400"
                  }
                >
                  {(s.driftSeconds ?? 0) >= 0 ? "+" : ""}
                  {((s.driftSeconds ?? 0) * 1000).toFixed(1)}ms
                </span>
              </div>
            </>
          )}
          {s.lastSchedule && (
            <>
              <div className="text-neutral-500">
                req-trk {s.lastSchedule.requestedTrackTime.toFixed(3)}s · started-off{" "}
                {s.lastSchedule.startedAtOffset.toFixed(3)}s · target{" "}
                {new Date(s.lastSchedule.targetServerTime).toISOString().slice(14, 23)}
              </div>
              <div className="text-neutral-500">
                at-sched offset={s.lastSchedule.offsetEstimateMs.toFixed(1)}ms · OL=
                {s.lastSchedule.outputLatencyMs.toFixed(1)}ms · synced=
                {s.lastSchedule.isSynced ? "y" : "n"}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
