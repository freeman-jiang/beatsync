// Per-shape Web Audio engine for map rooms. Each shape gets one
// AudioBufferSourceNode → proximityGain → masterGain → destination chain.
//
// Scheduling math + buffer loading delegate to globalStore so map rooms inherit
// beatsync's NTP offset, output-latency compensation, and decode pipeline exactly —
// the only thing we add on top is per-shape storage (multiple parallel chains).

import { audioContextManager } from "@/lib/audioContextManager";
import { computeScheduleTiming, downloadBufferFromURL, useGlobalStore } from "@/store/global";
import { useMapStore } from "@/store/map";
import { sendWSRequest } from "@/utils/ws";
import { epochNow, ClientActionEnum, MAP_CONSTANTS } from "@beatsync/shared";

// Minimum lead time we want between calling source.start() and the audio thread
// actually starting playback. Below this, start() is racy and tabs drift by a few ms
// from each other. Mirrors the 50ms threshold beatsync's schedulePlay uses.
const MIN_SCHEDULE_LEAD_MS = 50;
// When we're genuinely late (network/decode), how much extra delay to ask the audio
// thread for so the start lands sample-accurately. The buffer offset is advanced by
// the same amount so the playback position still tracks the server's timeline.
const LATE_RETRY_DELAY_MS = 250;

interface ShapeChain {
  buffer?: AudioBuffer;
  bufferPromise?: Promise<AudioBuffer>; // in-flight decode for the current URL
  url?: string; // URL the buffer was decoded from
  sourceNode?: AudioBufferSourceNode;
  proximityGain: GainNode; // 0..1 controlled by GPS distance
  // A play() that arrived before the buffer was ready (typical for late joiners who
  // get a unicast SCHEDULED_ACTION/PLAY in the initial burst without a prior LOAD).
  // Re-invoked from loadAudioForShape() once decode completes.
  pendingPlay?: { audioSource: string; trackTimeSeconds: number; targetServerTime: number };
  // Diagnostics: what we last scheduled, so getDebugInfo can compare actual vs
  // intended playback position across tabs.
  lastSchedule?: {
    startedAtCtxTime: number; // audioContext.currentTime when source.start() was called
    startedAtOffset: number; // the second arg to source.start (track position at start)
    targetServerTime: number; // server time the play was scheduled for
    requestedTrackTime: number; // trackTimeSeconds the server requested
    path: "on-time" | "late"; // which branch playShape took
    // NTP / latency snapshot at the time of scheduling — useful for diagnosing why
    // a tab landed at the wrong wall time. If offsetEstimateMs / outputLatencyMs
    // differ between tabs at schedule time, drift follows.
    offsetEstimateMs: number;
    outputLatencyMs: number;
    isSynced: boolean;
  };
}

const chains = new Map<string, ShapeChain>();

function getOrCreateChain(shapeId: string): ShapeChain {
  const existing = chains.get(shapeId);
  if (existing) return existing;
  const ctx = audioContextManager.getContext();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  // Connect to beatsync's input node (the head of low-pass → master-gain → destination)
  // so map-room audio inherits the room's low-pass + master volume controls just like
  // audio-room playback does.
  gain.connect(audioContextManager.getInputNode());
  const chain: ShapeChain = { proximityGain: gain };
  chains.set(shapeId, chain);
  return chain;
}

/**
 * Fetch + decode an audio source for a shape. Uses beatsync's downloadBufferFromURL
 * helper so map rooms share the same fetch / decode pipeline as the audio room.
 * Sends AUDIO_SOURCE_LOADED to the server when ready so the per-shape load gate
 * can advance.
 */
async function loadAudioForShape(shapeId: string, url: string): Promise<void> {
  const chain = getOrCreateChain(shapeId);
  if (chain.url === url && chain.buffer) {
    notifyLoaded(shapeId, url);
    return;
  }

  const decode = downloadBufferFromURL({ url }).then((r) => r.audioBuffer);

  chain.url = url;
  chain.bufferPromise = decode;
  try {
    const buffer = await decode;
    if (chains.get(shapeId)?.url !== url) {
      // A newer load superseded this one before decode finished — drop it.
      return;
    }
    chain.buffer = buffer;
    // Mirror the decoded buffer into the global audioSources registry so
    // getAudioDuration (Queue's "--:--" → duration cell) lights up for shape
    // tracks. Audio rooms hit this same path via loadAudioSource() in
    // globalStore; map rooms decode through mapAudio, so we have to write it
    // back ourselves.
    useGlobalStore.setState((state) => ({
      audioSources: state.audioSources.map((as) => (as.source.url === url ? { ...as, status: "loaded", buffer } : as)),
    }));
    notifyLoaded(shapeId, url);

    // If a play() arrived while we were decoding (late-join resume), re-fire it now
    // that the buffer is ready. Only honor it if the URL still matches the pending
    // play's source — otherwise a newer play has superseded it.
    if (chain.pendingPlay && chain.pendingPlay.audioSource === url) {
      const { audioSource, trackTimeSeconds, targetServerTime } = chain.pendingPlay;
      chain.pendingPlay = undefined;
      playShape(shapeId, audioSource, trackTimeSeconds, targetServerTime);
    }
  } catch (err) {
    console.error(`[mapAudio] decode failed for shape ${shapeId}`, err);
  } finally {
    if (chain.bufferPromise === decode) chain.bufferPromise = undefined;
  }
}

function notifyLoaded(shapeId: string, url: string): void {
  const ws = useGlobalStore.getState().socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // shapeId IS the contextId — every shape owns a playlist context with id =
  // shape.id, so the per-context load gate keys on the same string.
  sendWSRequest({
    ws,
    request: {
      type: ClientActionEnum.enum.AUDIO_SOURCE_LOADED,
      source: { url },
      contextId: shapeId,
    },
  });
}

/**
 * Schedule playback of a shape at the given server-time. Uses globalStore's
 * computeScheduleTiming so the math (NTP offset + nudge + output-latency
 * compensation + clamping) is identical to audio-room scheduling.
 */
function playShape(shapeId: string, audioSource: string, trackTimeSeconds: number, targetServerTime: number): void {
  const chain = getOrCreateChain(shapeId);

  // Buffer not ready (typical for late-join unicast resumes where there's no load
  // gate). Stash the play parameters; loadAudioForShape will replay once decode
  // completes.
  if (!chain.buffer || chain.url !== audioSource) {
    chain.pendingPlay = { audioSource, trackTimeSeconds, targetServerTime };
    void loadAudioForShape(shapeId, audioSource);
    return;
  }

  // NTP not synced yet (typical for a freshly-opened tab). Scheduling now would use
  // a stale offsetEstimate and land at the wrong wall time. Poll for sync, then re-fire.
  if (!useGlobalStore.getState().isSynced) {
    chain.pendingPlay = { audioSource, trackTimeSeconds, targetServerTime };
    waitForNtpSyncThenReplay(shapeId);
    return;
  }

  // AudioContext is suspended until the user makes a gesture. While suspended,
  // ctx.currentTime DOES NOT ADVANCE (Web Audio spec). If we call source.start(t)
  // now, the source won't actually play until t units of ctx-time have elapsed *after*
  // resume — which means audible playback is delayed by however long the context
  // remained suspended. That's the late-join-drift bug: new tab opens, server sends
  // the resume PLAY, NTP syncs, decode finishes, schedule is computed correctly, then
  // we wait for the user to click → context resumes → playback is N seconds late.
  //
  // Defer scheduling until the context is running. The autoplay-unlock effect in
  // MapRoom calls resume() on the first user gesture; once it fires, the statechange
  // listener below re-invokes playShape with the original args.
  if (audioContextManager.getContext().state !== "running") {
    chain.pendingPlay = { audioSource, trackTimeSeconds, targetServerTime };
    waitForAudioContextRunningThenReplay(shapeId);
    return;
  }

  chain.pendingPlay = undefined;

  // Stop any previous source.
  if (chain.sourceNode) {
    try {
      chain.sourceNode.stop();
    } catch {
      /* already stopped */
    }
    chain.sourceNode.disconnect();
    chain.sourceNode = undefined;
  }

  const ctx = audioContextManager.getContext();
  const source = audioContextManager.createBufferSource();
  source.buffer = chain.buffer;
  source.loop = true; // shape.loop is enforced server-side; default true matches map UX
  source.connect(chain.proximityGain);

  // Beatsync's exact scheduling logic, adapted for per-shape playback. Two cases:
  //
  //  1. ON TIME: rawWaitMs >= MIN_SCHEDULE_LEAD_MS. We have real audio-thread lead
  //     time, so source.start lands sample-accurately. waitSeconds already accounts
  //     for output latency, so audible playback hits targetServerTime exactly.
  //
  //  2. LATE: rawWaitMs < MIN_SCHEDULE_LEAD_MS. Calling source.start with ~0 lead
  //     is racy (different tabs land a few ms apart → drift). Instead, give the
  //     audio thread LATE_RETRY_DELAY_MS of lead time and advance the buffer
  //     offset by the same amount + however long we've already missed. Mirrors
  //     schedulePlay's retry-with-delay path in global.tsx:786.
  const { waitSeconds, rawWaitMs, outputLatencyMs } = computeScheduleTiming(targetServerTime);
  const duration = chain.buffer.duration;
  const state = useGlobalStore.getState();

  let startAt: number;
  let offsetRaw: number;
  let path: "on-time" | "late";

  if (rawWaitMs >= MIN_SCHEDULE_LEAD_MS) {
    startAt = ctx.currentTime + waitSeconds;
    offsetRaw = trackTimeSeconds;
    path = "on-time";
  } else {
    // Late path. epochNow here matches the one calculateWaitTimeMilliseconds used
    // inside computeScheduleTiming a moment ago, so the elapsed math is consistent.
    //
    // Sample becomes audible at wall time (now + LATE_RETRY_DELAY + outputLatency).
    // Mapped to server time, that's (target + elapsed + LATE_RETRY_DELAY + outputLatency).
    // For the audible position to match the server's intended timeline, the buffer
    // offset must be advanced by the same delta — INCLUDING outputLatency. The
    // on-time path's compensation hides this; the late path has to add it explicitly.
    const effectiveOffsetMs = state.offsetEstimate + state.nudgeOffsetMs;
    const elapsedSinceTargetMs = epochNow() + effectiveOffsetMs - targetServerTime;
    startAt = ctx.currentTime + LATE_RETRY_DELAY_MS / 1000;
    offsetRaw = trackTimeSeconds + (elapsedSinceTargetMs + LATE_RETRY_DELAY_MS + outputLatencyMs) / 1000;
    path = "late";
  }

  // Wrap into the looped buffer's range.
  const offset = duration > 0 ? ((offsetRaw % duration) + duration) % duration : 0;

  try {
    source.start(startAt, offset);
  } catch (err) {
    console.error(`[mapAudio] failed to start shape ${shapeId}`, err);
    return;
  }
  chain.sourceNode = source;
  chain.lastSchedule = {
    startedAtCtxTime: startAt,
    startedAtOffset: offset,
    targetServerTime,
    requestedTrackTime: trackTimeSeconds,
    path,
    offsetEstimateMs: state.offsetEstimate,
    outputLatencyMs,
    isSynced: state.isSynced,
  };
}

function pauseShape(shapeId: string): void {
  const chain = chains.get(shapeId);
  if (!chain?.sourceNode) return;
  try {
    chain.sourceNode.stop();
  } catch {
    /* already stopped */
  }
  chain.sourceNode.disconnect();
  chain.sourceNode = undefined;
}

/**
 * Set the proximity gain for a shape (0..1). Uses linearRampToValueAtTime with a
 * short ramp to avoid zipper noise on rapid GPS updates.
 */
function setProximityGain(shapeId: string, gain: number): void {
  const chain = getOrCreateChain(shapeId);
  const ctx = audioContextManager.getContext();
  const clamped = Math.max(0, Math.min(1, gain));
  const param = chain.proximityGain.gain;
  param.cancelScheduledValues(ctx.currentTime);
  param.setValueAtTime(param.value, ctx.currentTime);
  param.linearRampToValueAtTime(clamped, ctx.currentTime + MAP_CONSTANTS.PROXIMITY_GAIN_RAMP_SECONDS);
}

function unloadShape(shapeId: string): void {
  const chain = chains.get(shapeId);
  if (!chain) return;
  pauseShape(shapeId);
  chain.proximityGain.disconnect();
  chains.delete(shapeId);
  useMapStore.getState().setShapeAudioChain(shapeId, undefined);
}

/** Replay a shape's pending play once it's stored. Used by both the NTP and the
 *  AudioContext-state gates so they share one re-entry point. */
function replayPendingPlay(shapeId: string): void {
  const chain = chains.get(shapeId);
  if (!chain?.pendingPlay) return;
  const { audioSource, trackTimeSeconds, targetServerTime } = chain.pendingPlay;
  chain.pendingPlay = undefined;
  playShape(shapeId, audioSource, trackTimeSeconds, targetServerTime);
}

/**
 * Poll the global store every 100ms until NTP is synced, then re-fire the pending
 * play for the given shape. Each shape can have at most one pending wait at a time.
 */
const ntpWaiters = new Map<string, ReturnType<typeof setInterval>>();
function waitForNtpSyncThenReplay(shapeId: string): void {
  if (ntpWaiters.has(shapeId)) return;
  const id = setInterval(() => {
    if (!useGlobalStore.getState().isSynced) return;
    clearInterval(id);
    ntpWaiters.delete(shapeId);
    replayPendingPlay(shapeId);
  }, 100);
  ntpWaiters.set(shapeId, id);
}

/**
 * Listen for the AudioContext to transition to "running" (which happens after the
 * first user gesture unlocks autoplay), then re-fire the pending play. We attach a
 * statechange listener per shape — once it fires for any shape, all pending shapes
 * become eligible, but we keep them per-shape so the cleanup is straightforward.
 */
const ctxWaiters = new Map<string, () => void>();
function waitForAudioContextRunningThenReplay(shapeId: string): void {
  if (ctxWaiters.has(shapeId)) return;
  const ctx = audioContextManager.getContext();
  const handler = () => {
    if (ctx.state !== "running") return;
    ctx.removeEventListener("statechange", handler);
    ctxWaiters.delete(shapeId);
    replayPendingPlay(shapeId);
  };
  ctx.addEventListener("statechange", handler);
  ctxWaiters.set(shapeId, handler);
}

function reset(): void {
  for (const id of ntpWaiters.values()) clearInterval(id);
  ntpWaiters.clear();
  const ctx = audioContextManager.getContext();
  for (const handler of ctxWaiters.values()) ctx.removeEventListener("statechange", handler);
  ctxWaiters.clear();
  for (const shapeId of Array.from(chains.keys())) unloadShape(shapeId);
}

export interface ShapePlaybackDebug {
  shapeId: string;
  isPlaying: boolean;
  bufferDuration?: number;
  /** Where in the buffer we're playing RIGHT NOW (mod duration), based on ctx clock. */
  currentPosition?: number;
  /** Same as currentPosition but where the SERVER would say we should be — for comparison. */
  intendedPosition?: number;
  /** Difference: positive = we're ahead of server, negative = behind. In seconds. */
  driftSeconds?: number;
  lastSchedule?: ShapeChain["lastSchedule"];
}

/**
 * Snapshot of each shape's current playback state for the debug UI. Compare across
 * tabs to spot drift: currentPosition values should match within a few ms.
 */
function getDebugInfo(): ShapePlaybackDebug[] {
  const ctx = audioContextManager.getContext();
  const state = useGlobalStore.getState();
  const effectiveOffsetMs = state.offsetEstimate + state.nudgeOffsetMs;
  const serverNowMs = Date.now() + effectiveOffsetMs;

  const out: ShapePlaybackDebug[] = [];
  for (const [shapeId, chain] of chains.entries()) {
    const info: ShapePlaybackDebug = {
      shapeId,
      isPlaying: !!chain.sourceNode,
      bufferDuration: chain.buffer?.duration,
      lastSchedule: chain.lastSchedule,
    };
    if (chain.sourceNode && chain.lastSchedule && chain.buffer) {
      const elapsedSinceStart = ctx.currentTime - chain.lastSchedule.startedAtCtxTime;
      const rawPos = chain.lastSchedule.startedAtOffset + Math.max(0, elapsedSinceStart);
      info.currentPosition = ((rawPos % chain.buffer.duration) + chain.buffer.duration) % chain.buffer.duration;

      // What the server would say the position should be at the current moment.
      const elapsedSinceTargetMs = serverNowMs - chain.lastSchedule.targetServerTime;
      const intendedRaw = chain.lastSchedule.requestedTrackTime + Math.max(0, elapsedSinceTargetMs) / 1000;
      info.intendedPosition = ((intendedRaw % chain.buffer.duration) + chain.buffer.duration) % chain.buffer.duration;

      // Drift = current - intended. Wrap into [-duration/2, duration/2] for sane sign.
      const d = info.currentPosition - info.intendedPosition;
      const half = chain.buffer.duration / 2;
      info.driftSeconds = d > half ? d - chain.buffer.duration : d < -half ? d + chain.buffer.duration : d;
    }
    out.push(info);
  }
  return out;
}

/** Snapshot of every shape id with an active audio chain. Used by the React
 *  layer to detect shapes that disappeared from the server and tear them down. */
function knownShapeIds(): string[] {
  return Array.from(chains.keys());
}

export const mapAudio = {
  loadAudioForShape,
  playShape,
  pauseShape,
  setProximityGain,
  unloadShape,
  knownShapeIds,
  reset,
  getDebugInfo,
};
