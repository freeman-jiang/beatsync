// Tests the non-obvious dispatcher behaviors: payload transformation when
// routing scheduled actions, and exception containment semantics.

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { useGlobalStore } from "@/store/global";
import { dispatchWSResponse } from "@/websocket/dispatch";
import type { WSResponseContext } from "@/websocket/types";

const initialGlobalState = useGlobalStore.getState();

const createContext = (): WSResponseContext => ({
  ws: { send: mock((data: string) => void data), readyState: WebSocket.OPEN } as unknown as WebSocket,
  markNTPResponseReceived: mock(() => {}),
});

describe("dispatchWSResponse", () => {
  beforeEach(() => {
    useGlobalStore.setState(initialGlobalState, true);
  });

  afterEach(() => {
    useGlobalStore.setState(initialGlobalState, true);
  });

  it("threads serverTimeToExecute from the envelope into the scheduled action payload", () => {
    // The wire format carries timing on the envelope and the action separately;
    // the dispatcher must recombine them (targetServerTime <- serverTimeToExecute).
    // Getting this mapping wrong desyncs every client silently.
    const schedulePlay = mock(() => {});
    useGlobalStore.setState({ schedulePlay });

    dispatchWSResponse({
      response: {
        type: "SCHEDULED_ACTION",
        serverTimeToExecute: 12345,
        scheduledAction: { type: "PLAY", trackTimeSeconds: 7, audioSource: "https://cdn.example/song.mp3" },
      },
      context: createContext(),
    });

    expect(schedulePlay).toHaveBeenCalledWith({
      trackTimeSeconds: 7,
      targetServerTime: 12345,
      audioSource: "https://cdn.example/song.mp3",
    });
  });

  it("answers LIVENESS_PING with a LIVENESS_PONG on the socket that delivered it", () => {
    // This failure is invisible in development: foreground tabs send NTP every
    // 2.5s and are never pinged, so a broken PONG reply shows no symptom in any
    // normal dev session. In production it means every backgrounded phone gets
    // reaped at 60s — recreating the reconnect churn (and its egress bill) that
    // the liveness redesign eliminated.
    const context = createContext();
    const send = context.ws.send as unknown as ReturnType<typeof mock>;

    dispatchWSResponse({ response: { type: "LIVENESS_PING" }, context });

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0] as string)).toEqual({ type: "LIVENESS_PONG" });
  });
});
