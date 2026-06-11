// Tests the two non-obvious interactions in the reconnection state machine:
// wake events superseding in-flight backoff plans, and wake events restoring
// an exhausted retry budget. Single-path behaviors (guards, counters, giveup)
// are directly readable from the hook and intentionally not re-asserted here.

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useGlobalStore } from "@/store/global";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";

const initialGlobalState = useGlobalStore.getState();

const fakeSocket = (readyState: number) => ({ readyState }) as unknown as WebSocket;

const setupHook = (overrides: { maxAttempts?: number; onMaxAttemptsReached?: () => void } = {}) => {
  const createConnection = mock(() => {});
  const { result, unmount } = renderHook(() =>
    useWebSocketReconnection({
      createConnection,
      // Small real timers keep tests fast; production defaults are 1s/10s
      initialInterval: 10,
      maxInterval: 20,
      ...overrides,
    })
  );
  return { result, unmount, createConnection };
};

describe("useWebSocketReconnection", () => {
  beforeEach(() => {
    useGlobalStore.setState(initialGlobalState, true);
  });

  afterEach(() => {
    useGlobalStore.setState(initialGlobalState, true);
  });

  it("a wake event supersedes a pending backoff retry — exactly one connection results", async () => {
    // Two reconnection plans existing at once is the failure mode: the stale
    // backoff timer would fire after reconnectNow already connected, and
    // createConnection tears down the existing socket — killing the healthy
    // connection it was meant to restore.
    const { result, createConnection, unmount } = setupHook();
    useGlobalStore.setState({ socket: fakeSocket(WebSocket.CLOSED) });

    result.current.scheduleReconnection(); // backoff retry pending ~10ms out
    result.current.reconnectNow();
    expect(createConnection).toHaveBeenCalledTimes(1);

    await Bun.sleep(60);
    expect(createConnection).toHaveBeenCalledTimes(1);

    result.current.cleanup();
    unmount();
  });

  it("a wake event restores the attempt budget after the backoff path gave up", async () => {
    // Backoff exhaustion is permanent by design (dead client must stop hammering
    // the server) — but a wake event is evidence of changed conditions. Without
    // the budget reset, a tab that exhausted retries overnight could never
    // reconnect when the user returns in the morning.
    const onMaxAttemptsReached = mock(() => {});
    const { result, createConnection, unmount } = setupHook({ maxAttempts: 2, onMaxAttemptsReached });

    result.current.scheduleReconnection();
    result.current.scheduleReconnection();
    expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);

    useGlobalStore.setState({ socket: fakeSocket(WebSocket.CLOSED) });
    result.current.reconnectNow();
    expect(createConnection.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Budget is fresh: the next failure-driven attempt schedules instead of giving up
    result.current.scheduleReconnection();
    expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);

    await Bun.sleep(60);
    result.current.cleanup();
    unmount();
  });
});
