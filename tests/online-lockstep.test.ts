import { describe, expect, test } from "vitest";
import { OnlineLockstepController } from "../src/game/online/lockstep";
import type { InputFrame } from "../src/game/types";

const blankInput = (): InputFrame => ({
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
});

describe("online lockstep controller", () => {
  test("waits for both players before releasing delayed input", () => {
    const controller = new OnlineLockstepController({ networkDelayTicks: 2 });
    for (let tick = 0; tick <= 2; tick += 1) {
      controller.bufferInput(tick, 0, { left: tick === 0, right: false, pausePressed: false });
      controller.bufferInput(tick, 1, { left: false, right: tick === 0, pausePressed: false });
    }

    expect(controller.nextInputForSimulation(0)).toBeNull();
    expect(controller.nextInputForSimulation(1)).toBeNull();
    expect(controller.nextInputForSimulation(2)).toEqual({
      players: [{ left: true, right: false }, { left: false, right: true }],
      pausePressed: false
    });
  });

  test("enters waiting when the target tick is missing a remote input", () => {
    const controller = new OnlineLockstepController({ networkDelayTicks: 1 });
    controller.bufferInput(0, 0, { left: true, right: false, pausePressed: false });

    expect(controller.nextInputForSimulation(1)).toBeNull();
    expect(controller.status()).toEqual({
      phase: "waiting",
      waitingForTick: 0,
      missingPlayers: [1]
    });
  });

  test("produces identical input frames regardless of arrival order", () => {
    const first = new OnlineLockstepController({ networkDelayTicks: 0 });
    const second = new OnlineLockstepController({ networkDelayTicks: 0 });
    first.bufferInput(5, 0, { left: true, right: false, pausePressed: false });
    first.bufferInput(5, 1, { left: false, right: true, pausePressed: true });
    second.bufferInput(5, 1, { left: false, right: true, pausePressed: true });
    second.bufferInput(5, 0, { left: true, right: false, pausePressed: false });

    expect(first.nextInputForSimulation(5)).toEqual(second.nextInputForSimulation(5));
    expect(first.nextInputForSimulation(5)).not.toEqual(blankInput());
  });
});
