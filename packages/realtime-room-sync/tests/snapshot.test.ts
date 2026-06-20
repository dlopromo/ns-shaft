import { describe, expect, it } from "vitest";
import { SnapshotSync } from "../src/index.js";

describe("SnapshotSync", () => {
  it("rejects self, stale sequence, and wrong round snapshots", () => {
    const sync = new SnapshotSync<{ x: number }>({ localPlayerId: 0, round: 2, interpolate: (a, b, t) => ({ x: a.x + (b.x - a.x) * t }) });
    expect(sync.receive({ playerId: 0, round: 2, sequence: 1, sentAt: 10, state: { x: 1 } })).toBe(false);
    expect(sync.receive({ playerId: 1, round: 1, sequence: 1, sentAt: 10, state: { x: 1 } })).toBe(false);
    expect(sync.receive({ playerId: 1, round: 2, sequence: 1, sentAt: 10, state: { x: 1 } })).toBe(true);
    expect(sync.receive({ playerId: 1, round: 2, sequence: 1, sentAt: 11, state: { x: 2 } })).toBe(false);
  });

  it("tracks each remote independently and interpolates delayed state", () => {
    const sync = new SnapshotSync<{ x: number }>({ localPlayerId: 0, round: 1, interpolate: (a, b, t) => ({ x: a.x + (b.x - a.x) * t }) });
    sync.receive({ playerId: 1, round: 1, sequence: 1, sentAt: 100, state: { x: 0 } });
    sync.receive({ playerId: 1, round: 1, sequence: 2, sentAt: 200, state: { x: 10 } });
    sync.receive({ playerId: 2, round: 1, sequence: 1, sentAt: 200, state: { x: 20 } });
    expect(sync.sample(1, 250, 100)?.x).toBe(5);
    expect(sync.sample(2, 250, 100)?.x).toBe(20);
    expect(sync.remoteAge(1, 350)).toBe(150);
  });

  it("emits heartbeat snapshots even when state does not change", () => {
    const sync = new SnapshotSync<{ x: number }>({ localPlayerId: 0, round: 1, heartbeatMs: 1000 });
    const state = { x: 1 };
    expect(sync.publish(state, 0)).not.toBeNull();
    expect(sync.publish(state, 500)).toBeNull();
    expect(sync.publish(state, 1000)).not.toBeNull();
  });
});
