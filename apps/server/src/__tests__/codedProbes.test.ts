// Tests for Huygens-style coded probes: probe field echoing on the server,
// and the isProbeGapPure purity check logic.

import type { WSUnicastType } from "@beatsync/shared";
import { NTP_CONSTANTS } from "@beatsync/shared";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockServer, createMockWs } from "@/__tests__/mocks/websocket";
import { handleMessage, handleOpen } from "@/routes/websocketHandlers";
import { globalManager } from "@/managers/GlobalManager";
import type { BunServer } from "@/utils/websocket";

mockR2();

let unicastMessages: WSUnicastType[] = [];

void mock.module("@/utils/responses", () => ({
  sendBroadcast: mock(() => {
    /* noop */
  }),
  sendUnicast: mock(({ message }: { message: WSUnicastType }) => {
    unicastMessages.push(message);
  }),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

const ROOM_ID = "probe-test-room";

// Inline the pure function logic (same as apps/client/src/utils/ntp.ts isProbeGapPure)
// to test without cross-package import
function isProbeGapPure(data: { t0First: number; t0Second: number; t1First: number; t1Second: number }): boolean {
  const clientGap = data.t0Second - data.t0First;
  const serverGap = data.t1Second - data.t1First;
  return Math.abs(serverGap - clientGap) <= NTP_CONSTANTS.PROBE_GAP_TOLERANCE_MS;
}

describe("coded probes", () => {
  let server: BunServer;

  beforeEach(() => {
    unicastMessages = [];
    server = createMockServer();
    for (const id of globalManager.getRoomIds()) {
      globalManager.deleteRoom(id);
    }
  });

  describe("server echo", () => {
    it("should echo probeGroupId and probeGroupIndex in NTP_RESPONSE", async () => {
      const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
      handleOpen(ws, server);

      await handleMessage(
        ws,
        JSON.stringify({
          type: "NTP_REQUEST",
          t0: 1000,
          probeGroupId: 42,
          probeGroupIndex: 0,
        }),
        server
      );

      const response = unicastMessages.find((m) => m.type === "NTP_RESPONSE");
      expect(response).toBeTruthy();
      if (response?.type === "NTP_RESPONSE") {
        expect(response.probeGroupId).toBe(42);
        expect(response.probeGroupIndex).toBe(0);
        expect(response.t0).toBe(1000);
        expect(response.t1).toBeGreaterThan(0);
        expect(response.t2).toBeGreaterThan(0);
      }
    });

    it("should echo probeGroupIndex 1 for the second probe", async () => {
      const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
      handleOpen(ws, server);

      await handleMessage(
        ws,
        JSON.stringify({
          type: "NTP_REQUEST",
          t0: 2000,
          probeGroupId: 42,
          probeGroupIndex: 1,
        }),
        server
      );

      const response = unicastMessages.find((m) => m.type === "NTP_RESPONSE");
      expect(response).toBeTruthy();
      if (response?.type === "NTP_RESPONSE") {
        expect(response.probeGroupId).toBe(42);
        expect(response.probeGroupIndex).toBe(1);
      }
    });

    it("should reject NTP requests without probe fields", async () => {
      const ws = createMockWs({ clientId: "client-1", roomId: ROOM_ID });
      handleOpen(ws, server);

      await handleMessage(
        ws,
        JSON.stringify({
          type: "NTP_REQUEST",
          t0: 3000,
        }),
        server
      );

      // Zod validation rejects it — no NTP_RESPONSE sent, error sent instead
      const response = unicastMessages.find((m) => m.type === "NTP_RESPONSE");
      expect(response).toBeUndefined();
    });
  });

  describe("isProbeGapPure", () => {
    const { PROBE_GAP_TOLERANCE_MS } = NTP_CONSTANTS;

    it("should return true when server gap matches client gap exactly", () => {
      // Client sent 5ms apart, server received 5ms apart
      expect(isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2005 })).toBe(true);
    });

    it("should return true when setTimeout fires late but gap is preserved", () => {
      // Client sent 8ms apart (setTimeout jitter), server received 8ms apart — still pure
      expect(isProbeGapPure({ t0First: 1000, t0Second: 1008, t1First: 2000, t1Second: 2008 })).toBe(true);
    });

    it("should return true at the tolerance boundary", () => {
      // Client gap 5ms, server gap 5ms + tolerance
      expect(
        isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2005 + PROBE_GAP_TOLERANCE_MS })
      ).toBe(true);
    });

    it("should return true at the negative tolerance boundary", () => {
      // Client gap 5ms, server gap 5ms - tolerance
      expect(
        isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2005 - PROBE_GAP_TOLERANCE_MS })
      ).toBe(true);
    });

    it("should return false when second probe was queued (server gap too large)", () => {
      // Client gap 5ms, server gap 5ms + tolerance + 1 (second probe delayed)
      expect(
        isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2005 + PROBE_GAP_TOLERANCE_MS + 1 })
      ).toBe(false);
    });

    it("should return false when first probe was queued (server gap too small)", () => {
      // Client gap 5ms, server gap 5ms - tolerance - 1 (first probe delayed, arrived close to second)
      expect(
        isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2005 - PROBE_GAP_TOLERANCE_MS - 1 })
      ).toBe(false);
    });

    it("should return false when gap is massively distorted", () => {
      // Client gap 5ms, server gap 50ms — massive queuing
      expect(isProbeGapPure({ t0First: 1000, t0Second: 1005, t1First: 2000, t1Second: 2050 })).toBe(false);
    });
  });
});
