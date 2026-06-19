import { describe, expect, test } from "vitest";
import {
  INPUT_BATCH_SIZE,
  InputBatchAssembler,
  checkpointHash,
  selectBufferTicks
} from "../src/game/online/sync";
import { GameSimulation } from "../src/game/simulation";

describe("online transport primitives", () => {
  test("selects a shared three-frame-aligned buffer from RTT and jitter", () => {
    expect(selectBufferTicks([])).toBe(12);
    expect(selectBufferTicks([{ rttMs: 40, jitterMs: 5 }])).toBe(6);
    expect(selectBufferTicks([{ rttMs: 180, jitterMs: 30 }])).toBe(12);
    expect(selectBufferTicks([{ rttMs: 900, jitterMs: 200 }])).toBe(15);
  });

  test("assembles local input into ordered three-frame batches", () => {
    const assembler = new InputBatchAssembler(4, 1);
    expect(INPUT_BATCH_SIZE).toBe(3);
    expect(assembler.push({ left: true, right: false })).toBeNull();
    expect(assembler.push({ left: false, right: false })).toBeNull();
    expect(assembler.push({ left: false, right: true })).toEqual({
      round: 4,
      playerId: 1,
      sequence: 0,
      startTick: 0,
      frames: [
        { left: true, right: false },
        { left: false, right: false },
        { left: false, right: true }
      ]
    });
  });

  test("hashes complete checkpoints deterministically", () => {
    const game = new GameSimulation({ seed: 55, difficulty: "normal", players: 2 });
    const first = game.exportCheckpoint();
    expect(checkpointHash(first)).toBe(checkpointHash(structuredClone(first)));
    game.step({
      players: [{ left: false, right: true }, { left: false, right: false }],
      pausePressed: false
    }, 1000 / 60);
    expect(checkpointHash(game.exportCheckpoint())).not.toBe(checkpointHash(first));
  });
});
