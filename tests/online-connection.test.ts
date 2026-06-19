import { describe, expect, test } from "vitest";
import {
  connectionPresentation,
  OnlineConnectionMonitor,
  SYNCING_AFTER_MS,
  DISCONNECT_CONFIRM_MS
} from "../src/game/online/connection";

describe("OnlineConnectionMonitor", () => {
  test("uses a non-blocking indicator until disconnection is confirmed", () => {
    expect(connectionPresentation("healthy")).toEqual({ indicator: false, dialog: false });
    expect(connectionPresentation("syncing")).toEqual({ indicator: true, dialog: false });
    expect(connectionPresentation("disconnected")).toEqual({ indicator: false, dialog: true });
  });

  test("degrades after five seconds without declaring a connected peer offline", () => {
    const monitor = new OnlineConnectionMonitor(0);

    expect(monitor.state(SYNCING_AFTER_MS - 1)).toBe("healthy");
    expect(monitor.state(SYNCING_AFTER_MS)).toBe("syncing");
    expect(monitor.state(60_000)).toBe("syncing");
  });

  test("requires both stale activity and fifteen seconds of false presence", () => {
    const monitor = new OnlineConnectionMonitor(0);
    monitor.setPeerPresence(false, 2_000);

    expect(monitor.state(2_000 + DISCONNECT_CONFIRM_MS - 1)).toBe("syncing");
    expect(monitor.state(2_000 + DISCONNECT_CONFIRM_MS)).toBe("disconnected");
  });

  test("any peer payload immediately clears a transient disconnect warning", () => {
    const monitor = new OnlineConnectionMonitor(0);
    monitor.setPeerPresence(false, 1_000);
    expect(monitor.state(20_000)).toBe("disconnected");

    monitor.markPeerActivity(20_000);
    expect(monitor.state(20_000)).toBe("healthy");
    expect(monitor.state(20_000 + SYNCING_AFTER_MS)).toBe("syncing");
  });

  test("presence recovery cancels confirmation and pause suppresses warnings", () => {
    const monitor = new OnlineConnectionMonitor(0);
    monitor.setPeerPresence(false, 1_000);
    monitor.setPeerPresence(true, 10_000);

    expect(monitor.state(30_000)).toBe("syncing");
    expect(monitor.state(30_000, true)).toBe("healthy");
  });
});
