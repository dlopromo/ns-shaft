import { describe, expect, test } from "vitest";
import { DIFFICULTIES } from "../src/game/difficulty";
import { GAME_LAYOUT } from "../src/game/layout";
import { GameSimulation, IPEL_PHYSICS } from "../src/game/simulation";
import type { InputFrame } from "../src/game/types";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("GameSimulation gameplay rules", () => {
  test("starts above a centered normal floor with a queued floor below the viewport", () => {
    const game = new GameSimulation({ seed: 21, difficulty: "normal", players: 2 });
    const state = game.snapshot();
    expect(state.players.map((player) => player.health)).toEqual([12, 12]);
    expect(state.players.map((player) => player.standingPlayerId)).toEqual([null, null]);
    const startFloor = state.platforms.find((platform) =>
      platform.kind === "normal" &&
      platform.x === GAME_LAYOUT.playable.x +
        (GAME_LAYOUT.playable.width - IPEL_PHYSICS.platformWidth) / 2 &&
      platform.y < 356
    );
    expect(startFloor).toBeDefined();
    for (const player of state.players) {
      expect(player.y).toBe(326);
      expect(startFloor!.y - player.y).toBe(18);
    }
    expect(state.platforms.some((platform) => platform.y >= 356)).toBe(true);
  });

  test("uses foot coordinates and starts falling after walking clear of a floor", () => {
    const game = new GameSimulation({ seed: 22, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 100, y: 300, width: 70, kind: "normal",
      direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, {
      x: 130, y: 300, standingPlatformId: 1, onPlatformSince: 0
    });
    game.step(idle, 20);
    expect(game.snapshot().players[0].y).toBeCloseTo(game.snapshot().platforms[0].y);
    game.debugSetPlayer(0, { x: 184 });
    game.step(idle, 20);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
  });

  test("emits landing, healing, spike and conveyor events", () => {
    const game = new GameSimulation({ seed: 5, difficulty: "normal", players: 1 });
    game.debugSetPlayer(0, { health: 5 });
    game.debugResolveLanding(0, "normal");
    game.debugResolveLanding(0, "spike");
    expect(game.drainEvents().map((event) => event.type)).toEqual([
      "land", "heal", "land", "hurt"
    ]);
  });

  test("tracks pose, facing and one second hurt blink period", () => {
    const game = new GameSimulation({ seed: 6, difficulty: "normal", players: 1 });
    game.step({
      ...idle,
      players: [{ left: true, right: false }, idle.players[1]]
    }, 20);
    expect(game.snapshot().players[0].facing).toBe("left");
    game.debugResolveLanding(0, "spike");
    expect(game.snapshot().players[0].hurtUntilMs).toBe(1020);
    expect(game.snapshot().players[0]).toMatchObject({
      pose: "hurt",
      facing: "left"
    });
  });

  test("preserves both players' facing while falling after moving left", () => {
    const game = new GameSimulation({ seed: 61, difficulty: "normal", players: 2 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "normal",
      variant: "normal", direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, { x: 120, y: 260, standingPlatformId: 1, facing: "left" });
    game.debugSetPlayer(1, { x: 140, y: 260, standingPlatformId: 1, facing: "left" });

    game.step({
      players: [{ left: true, right: false }, { left: true, right: false }],
      pausePressed: false
    }, 20);
    game.debugSetPlayer(0, { x: 20, vy: 0.2, standingPlatformId: null });
    game.debugSetPlayer(1, { x: 30, vy: 0.2, standingPlatformId: null });
    game.step(idle, 20);

    expect(game.snapshot().players.map((player) => ({
      pose: player.pose,
      facing: player.facing
    }))).toEqual([
      { pose: "fall", facing: "left" },
      { pose: "fall", facing: "left" }
    ]);
  });

  test("two players block horizontal overlap", () => {
    const game = new GameSimulation({ seed: 62, difficulty: "normal", players: 2 });
    game.debugSetPlatforms([]);
    game.debugSetPlayer(0, { x: 190, y: 260, vy: 0, facing: "right" });
    game.debugSetPlayer(1, { x: 216, y: 260, vy: 0, facing: "left" });

    game.step({
      players: [{ left: false, right: true }, { left: true, right: false }],
      pausePressed: false
    }, 100);

    const [first, second] = game.snapshot().players;
    expect(second.x - first.x).toBeGreaterThanOrEqual(first.width);
  });

  test("falling player can land on the other player's head", () => {
    const game = new GameSimulation({ seed: 63, difficulty: "normal", players: 2 });
    game.debugSetPlatforms([]);
    game.debugSetPlayer(0, { x: 160, y: 260, vy: 0, standingPlatformId: null });
    game.debugSetPlayer(1, { x: 160, y: 232, vy: 0.2, standingPlatformId: null });

    game.step(idle, 40);

    const [lower, upper] = game.snapshot().players;
    expect(upper.y).toBeCloseTo(lower.y - lower.height);
    expect(upper.standingPlayerId).toBe(lower.id);
  });

  test("uses a walking pose while moving left or right on a floor", () => {
    const game = new GameSimulation({ seed: 8, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "normal",
      variant: "normal", direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1, pose: "stand"
    });

    game.step({
      players: [{ left: true, right: false }, { left: false, right: false }],
      pausePressed: false
    }, 20);
    expect(game.snapshot().players[0]).toMatchObject({
      pose: "walk", facing: "left"
    });

    game.step({
      players: [{ left: false, right: true }, { left: false, right: false }],
      pausePressed: false
    }, 20);
    expect(game.snapshot().players[0]).toMatchObject({
      pose: "walk", facing: "right"
    });
  });

  test("keeps the full visible player sprite inside the blue side walls", () => {
    const game = new GameSimulation({ seed: 12, difficulty: "normal", players: 1 });
    const innerLeft = GAME_LAYOUT.playable.x;
    const innerRight = GAME_LAYOUT.playable.x + GAME_LAYOUT.playable.width;
    const visibleHalf = 16;

    game.debugSetPlatforms([]);
    game.debugSetPlayer(0, {
      x: 40, y: 260, vy: 0, standingPlatformId: null
    });
    game.step({
      players: [{ left: true, right: false }, idle.players[1]],
      pausePressed: false
    }, 1000);
    expect(game.snapshot().players[0].x).toBeGreaterThanOrEqual(innerLeft + visibleHalf);

    game.debugSetPlayer(0, {
      x: 380, y: 260, vy: 0, standingPlatformId: null
    });
    game.step({
      players: [{ left: false, right: true }, idle.players[1]],
      pausePressed: false
    }, 1000);
    expect(game.snapshot().players[0].x).toBeLessThanOrEqual(innerRight - visibleHalf);
  });

  test("generates only fully visible platforms", () => {
    const game = new GameSimulation({ seed: 13, difficulty: "hard", players: 1 });
    for (let elapsed = 0; elapsed < 120_000; elapsed += 20) {
      game.debugSetPlayer(0, { alive: true, health: 12, y: 180, vy: 0 });
      game.step(idle, 20);
    }
    const xs = game.snapshot().platforms.map((platform) => platform.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(GAME_LAYOUT.playable.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(
      GAME_LAYOUT.playable.x + GAME_LAYOUT.playable.width - IPEL_PHYSICS.platformWidth
    );
  });

  test("lands only while crossing a platform top", () => {
    const game = new GameSimulation({ seed: 2, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 120, y: 150, width: 96, kind: "normal",
      direction: 1, phase: 0, collidable: true
    }]);
    game.debugSetPlayer(0, { x: 150, y: 145, vy: 0.2 });
    game.step(idle, 20);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
    expect(game.snapshot().players[0].y).toBeCloseTo(game.snapshot().platforms[0].y);
  });

  test("continues two-player mode until both players are dead", () => {
    const game = new GameSimulation({ seed: 4, difficulty: "normal", players: 2 });
    game.debugSetPlayer(0, { alive: false });
    game.step(idle, 20);
    expect(game.snapshot().mode).toBe("playing");
    game.debugSetPlayer(1, { alive: false });
    game.step(idle, 20);
    expect(game.snapshot().mode).toBe("gameover");
  });

  test("difficulty profiles increase base scrolling pressure with fixed spacing", () => {
    expect(Math.abs(DIFFICULTIES.easy.basePlatformVelocity))
      .toBeLessThan(Math.abs(DIFFICULTIES.normal.basePlatformVelocity));
    expect(Math.abs(DIFFICULTIES.normal.basePlatformVelocity))
      .toBeLessThan(Math.abs(DIFFICULTIES.hard.basePlatformVelocity));
    expect(new Set(Object.values(DIFFICULTIES).map((profile) => profile.platformGap)))
      .toEqual(new Set([60]));
  });

  test("keeps the bottom supplied during a five-minute deterministic run", () => {
    const game = new GameSimulation({ seed: 1997, difficulty: "hard", players: 1 });
    for (let elapsed = 0; elapsed < 300_000; elapsed += 100) {
      game.debugSetPlayer(0, { alive: true, health: 10, y: 180, vy: 0 });
      game.step(idle, 100);
      const lowest = Math.max(...game.snapshot().platforms.map((platform) => platform.y));
      expect(lowest + IPEL_PHYSICS.platformCollisionHeight).toBeGreaterThanOrEqual(356);
    }
  });

  test("applies disabled mechanisms to the initial screen before play starts", () => {
    const game = new GameSimulation({ seed: 7, difficulty: "hard", players: 1 });
    game.setOptions({ conveyor: false, spring: false, rotating: false });
    expect(game.snapshot().platforms.every((platform) =>
      !["conveyor-left", "conveyor-right", "spring", "disappearing"]
        .includes(platform.variant)
    )).toBe(true);
  });
});
