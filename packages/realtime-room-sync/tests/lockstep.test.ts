import { describe, expect, it } from "vitest";
import { LockstepSync } from "../src/index.js";

describe("LockstepSync", () => {
  it("buffers 2/3/4 participants and returns immutable player maps", () => {
    for (const participants of [[0, 1], [0, 1, 2], [0, 1, 2, 3]]) {
      const sync = new LockstepSync<number, { floor: number }>({
        localPlayerId: 0,
        participants,
        inputDelayTicks: 2,
        neutralInput: () => 0
      });
      for (const playerId of participants) sync.receiveInputs({ playerId, participantEpoch: 1, frames: [{ tick: 2, input: playerId + 1 }] });
      const frame = sync.takeFrame(2);
      expect([...frame!.entries()]).toEqual(participants.map((id) => [id, id + 1]));
    }
  });

  it("rejects old epochs and resets from checkpoints", () => {
    const sync = new LockstepSync<string, { score: number }>({ localPlayerId: 0, participants: [0, 1], neutralInput: () => "-" });
    sync.setParticipants([0, 2], 2);
    expect(sync.receiveInputs({ playerId: 1, participantEpoch: 1, frames: [{ tick: 0, input: "old" }] })).toBe(false);
    sync.applyCheckpoint({ tick: 40, participantEpoch: 2, state: { score: 9 }, hash: "abc" });
    expect(sync.tick).toBe(40);
    expect(sync.checkpoint?.state.score).toBe(9);
  });

  it("adapts input delay within configured bounds", () => {
    const sync = new LockstepSync<number, never>({
      localPlayerId: 0, participants: [0, 1], neutralInput: () => 0,
      inputDelayTicks: 3, minInputDelayTicks: 2, maxInputDelayTicks: 8
    });
    expect(sync.observeRoundTrip(220)).toBeGreaterThan(3);
    expect(sync.observeRoundTrip(20)).toBeGreaterThanOrEqual(2);
  });
});
