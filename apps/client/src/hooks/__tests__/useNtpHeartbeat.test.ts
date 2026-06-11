// Tests the staleness invariant the server-side liveness design depends on:
// the client only self-closes when a *sent* NTP request went unanswered — a
// long gap between timer fires (browser throttling of a backgrounded tab) must
// NOT be misread as staleness when the last response did arrive. The interplay
// is subtle: markNTPResponseReceived nulls the pending-request ref, and the
// stale check runs against that ref at the *next* timer fire, however late.
//
// Real timers drive the scheduling (initial cadence is 50ms); setSystemTime
// jumps the wall clock to simulate multi-second throttle gaps instantly.

import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useGlobalStore } from "@/store/global";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";

const initialGlobalState = useGlobalStore.getState();

// Past NTP_CONSTANTS.RESPONSE_TIMEOUT_MS (3.75s) — a throttled tab's timer gap
const THROTTLE_GAP_MS = 4_000;

const setupHook = () => {
  const sendProbePair = mock(() => {});
  useGlobalStore.setState({ sendProbePair });
  const onConnectionStale = mock(() => {});
  const { result, unmount } = renderHook(() => useNtpHeartbeat({ onConnectionStale }));
  return { result, unmount, sendProbePair, onConnectionStale };
};

// Wait for the next heartbeat fire (50ms initial cadence) with margin
const nextFire = () => Bun.sleep(80);

describe("useNtpHeartbeat staleness detection", () => {
  beforeEach(() => {
    useGlobalStore.setState(initialGlobalState, true);
  });

  afterEach(() => {
    setSystemTime(); // restore real clock
    useGlobalStore.setState(initialGlobalState, true);
  });

  it("declares the connection stale when a sent request goes unanswered past the timeout", async () => {
    const { result, unmount, sendProbePair, onConnectionStale } = setupHook();

    result.current.startHeartbeat();
    await nextFire(); // fire #1 sends a probe and records the pending request
    expect(sendProbePair).toHaveBeenCalledTimes(1);

    // No response arrives; the wall clock jumps past the response timeout
    setSystemTime(new Date(Date.now() + THROTTLE_GAP_MS));
    await nextFire(); // fire #2 sees the unanswered request

    expect(onConnectionStale).toHaveBeenCalledTimes(1);
    // The heartbeat stops: no further probes after declaring stale
    expect(sendProbePair).toHaveBeenCalledTimes(1);

    result.current.stopHeartbeat();
    unmount();
  });

  it("does NOT declare stale after a long timer gap when the response did arrive", async () => {
    // The backgrounded-tab case: the browser delays the next timer fire far past
    // the response timeout, but the previous request was answered. Misreading
    // this as staleness would close healthy backgrounded connections and
    // recreate the reconnect churn the liveness redesign eliminated.
    const { result, unmount, sendProbePair, onConnectionStale } = setupHook();

    result.current.startHeartbeat();
    await nextFire(); // fire #1 sends a probe
    expect(sendProbePair).toHaveBeenCalledTimes(1);

    result.current.markNTPResponseReceived(); // response arrived
    setSystemTime(new Date(Date.now() + THROTTLE_GAP_MS)); // then the tab was throttled
    await nextFire(); // late fire #2

    expect(onConnectionStale).not.toHaveBeenCalled();
    // The heartbeat continues normally: the late fire sends further probes
    expect(sendProbePair.mock.calls.length).toBeGreaterThanOrEqual(2);

    result.current.stopHeartbeat();
    unmount();
  });
});
