import { describe, expect, test } from "vitest";
import { GameSimulation, IPEL_PHYSICS } from "../src/game/simulation";
import type { InputFrame } from "../src/game/types";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("iPel-aligned millisecond simulation", () => {
  test("publishes the reference physics constants", () => {
    expect(IPEL_PHYSICS).toMatchObject({
      maxSubstepMs: 20,
      gravity: 0.0015,
      controlVelocity: 0.2,
      conveyorVelocity: 0.1,
      springVelocity: -0.35,
      springCompressionMs: 80,
      disappearingHoldMs: 150,
      disappearingTurnMs: 240,
      platformGap: 60,
      platformCollisionHeight: 12,
      playerCollisionSize: 26,
      spikeDamage: 5,
      maxHealth: 12
    });
  });

  test("splits elapsed time into deterministic substeps no larger than 20ms", () => {
    const whole = new GameSimulation({ seed: 41, difficulty: "hard", players: 1 });
    const chunks = new GameSimulation({ seed: 41, difficulty: "hard", players: 1 });
    whole.step(idle, 100);
    for (let index = 0; index < 5; index += 1) chunks.step(idle, 20);
    expect(whole.snapshot()).toEqual(chunks.snapshot());
    expect(whole.snapshot().timeMs).toBe(100);
  });

  test("applies iPel horizontal velocity per millisecond", () => {
    const game = new GameSimulation({ seed: 42, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([]);
    game.debugSetPlayer(0, { x: 100, y: 120, vy: 0 });
    game.step({
      ...idle,
      players: [{ left: false, right: true }, idle.players[1]]
    }, 100);
    expect(game.snapshot().players[0].x).toBeCloseTo(120);
  });

  test("uses fixed 60px floor spacing and fills below the viewport", () => {
    const game = new GameSimulation({ seed: 43, difficulty: "hard", players: 1 });
    const platforms = game.snapshot().platforms.slice().sort((a, b) => a.y - b.y);
    for (let index = 1; index < platforms.length; index += 1) {
      expect(platforms[index].y - platforms[index - 1].y).toBeCloseTo(60);
    }
    expect(platforms.at(-1)!.y + IPEL_PHYSICS.platformCollisionHeight)
      .toBeGreaterThanOrEqual(356);
  });

  test("compresses a spring for 160ms before launch", () => {
    const game = new GameSimulation({ seed: 44, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      ageTicks: 0, height: 12, conveyorVelocity: 0, activationState: "triggered"
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, vy: 0, standingPlatformId: 1, onPlatformSince: 0
    });
    game.step(idle, 159);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
    game.step(idle, 1);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
    expect(game.snapshot().players[0].vy).toBeCloseTo(-0.35);
  });

  test("keeps the spring triggered during its 80ms rebound", () => {
    const game = new GameSimulation({ seed: 440, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      activationState: "triggered"
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1
    });
    game.step(idle, 220);
    expect(game.snapshot().platforms[0].activationState).toBe("triggered");
    game.step(idle, 20);
    expect(game.snapshot().platforms[0].activationState).toBe("active");
  });

  test("does not launch the player back to the previous platform row", () => {
    const game = new GameSimulation({ seed: 441, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([
      {
        id: 1, x: 80, y: 260, width: 96, kind: "spring",
        variant: "spring", direction: 1, phase: 0, collidable: true,
        activationState: "triggered"
      },
      {
        id: 2, x: 80, y: 200, width: 96, kind: "normal",
        variant: "normal", direction: 1, phase: 0, collidable: true
      }
    ]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1
    });
    let closestGap = Number.POSITIVE_INFINITY;
    for (let elapsed = 0; elapsed < 700; elapsed += 20) {
      game.step(idle, 20);
      const state = game.snapshot();
      const player = state.players[0];
      const previousRow = state.platforms.find((platform) => platform.id === 2)!;
      closestGap = Math.min(closestGap, player.y - previousRow.y);
      expect(player.y).toBeGreaterThan(previousRow.y);
      expect(player.standingPlatformId).not.toBe(2);
    }
    expect(closestGap).toBeLessThan(IPEL_PHYSICS.platformGap);
  });

  test("holds the player for 150ms, then drops them for one roll and resets", () => {
    const game = new GameSimulation({ seed: 45, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([
      {
        id: 1, x: 80, y: 260, width: 96, kind: "rotating",
        variant: "disappearing", direction: 1, phase: 0, collidable: true,
        ageTicks: 0, height: 12, conveyorVelocity: 0, activationState: "active"
      },
      {
        id: 2, x: 80, y: 350, width: 96, kind: "normal",
        variant: "normal", direction: 1, phase: 0, collidable: true
      }
    ]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, vy: 0, standingPlatformId: 1, onPlatformSince: 0
    });
    game.step(idle, 20);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
    expect(game.snapshot().platforms[0]).toMatchObject({
      activationState: "triggered", collidable: true, activationAgeMs: 0
    });
    game.step(idle, 149);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
    expect(game.snapshot().platforms[0].collidable).toBe(true);
    game.step(idle, 1);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
    expect(game.snapshot().platforms[0]).toMatchObject({
      activationState: "disappearing", collidable: false, activationAgeMs: 150
    });
    game.step(idle, 220);
    expect(game.snapshot().platforms[0].activationState).toBe("disappearing");
    game.step(idle, 20);
    expect(game.snapshot().platforms[0]).toMatchObject({
      activationState: "active", collidable: true, activationAgeMs: 0
    });
  });

  test("matches iPel life changes", () => {
    const game = new GameSimulation({ seed: 46, difficulty: "hard", players: 1 });
    game.debugSetPlayer(0, { health: 12 });
    game.debugResolveLanding(0, "spike");
    expect(game.snapshot().players[0].health).toBe(7);
    game.debugResolveLanding(0, "normal");
    expect(game.snapshot().players[0].health).toBe(8);
    game.debugSetPlayer(0, { health: 12 });
    game.debugResolveLanding(0, "normal");
    expect(game.snapshot().players[0].health).toBe(12);
  });

  test("detects landing against a platform moving upward during the same substep", () => {
    const game = new GameSimulation({ seed: 47, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 140, y: 340, width: 96, kind: "normal",
      direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, { x: 196, y: 338, vy: 0.1 });
    game.step(idle, 20);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
  });

  test("moves a player only while standing on a conveyor rail", () => {
    const game = new GameSimulation({ seed: 48, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "conveyor",
      variant: "conveyor-right", direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1, vx: 0
    });
    game.step(idle, 100);
    expect(game.snapshot().players[0].x).toBeCloseTo(130);
  });

  test("a rotating block never inherits conveyor movement", () => {
    const game = new GameSimulation({ seed: 49, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "rotating",
      variant: "disappearing", direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1, vx: IPEL_PHYSICS.conveyorVelocity
    });
    game.step(idle, 100);
    expect(game.snapshot().players[0].x).toBeCloseTo(120);
  });
});
