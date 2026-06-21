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
      conveyorAssistVelocity: 0.15,
      conveyorResistanceVelocity: 0.05,
      springVelocity: -0.5,
      springCompressionMs: 100,
      disappearingHoldMs: 100,
      disappearingTurnMs: 250,
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

  test("launches 100ms after touching a spring even after walking off it", () => {
    const game = new GameSimulation({ seed: 44, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      ageTicks: 0, height: 12, conveyorVelocity: 0, activationState: "triggered"
    }]);
    game.debugSetPlayer(0, {
      x: 170, y: 260, vy: 0, standingPlatformId: 1, onPlatformSince: 0,
      springLaunchAtMs: 100, springLaunchPlatformId: 1
    });
    const right: InputFrame = {
      ...idle,
      players: [{ left: false, right: true }, idle.players[1]]
    };
    game.step(right, 99);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
    expect(game.snapshot().players[0].springLaunchAtMs).toBe(100);
    game.step(idle, 1);
    expect(game.snapshot().players[0].vy).toBeCloseTo(-0.5);
    expect(game.snapshot().players[0].springLaunchAtMs).toBeNull();
  });

  test("times each player's spring launch from their own landing", () => {
    const game = new GameSimulation({ seed: 444, difficulty: "hard", players: 2 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      activationState: "triggered"
    }]);
    game.debugSetPlayer(0, {
      x: 110, y: 260, standingPlatformId: 1, onPlatformSince: 0,
      springLaunchAtMs: 100, springLaunchPlatformId: 1
    });
    game.debugSetPlayer(1, {
      x: 150, y: 200, standingPlatformId: null, onPlatformSince: null
    });
    game.step(idle, 50);
    game.debugSetPlayer(1, {
      x: 150, y: game.snapshot().platforms[0].y,
      standingPlatformId: 1, onPlatformSince: game.snapshot().timeMs, vy: 0,
      springLaunchAtMs: game.snapshot().timeMs + 100,
      springLaunchPlatformId: 1
    });

    game.step(idle, 50);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
    expect(game.snapshot().players[1].standingPlatformId).toBe(1);
    game.step(idle, 49);
    expect(game.snapshot().players[1].standingPlatformId).toBe(1);
    game.step(idle, 1);
    expect(game.snapshot().players[1].standingPlatformId).toBeNull();
  });

  test("keeps the spring triggered during its 100ms rebound", () => {
    const game = new GameSimulation({ seed: 440, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      activationState: "triggered"
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1, onPlatformSince: 0
    });
    game.step(idle, 150);
    expect(game.snapshot().platforms[0].activationState).toBe("triggered");
    game.step(idle, 50);
    expect(game.snapshot().platforms[0].activationState).toBe("active");
  });

  test("spring launch skips landing on platforms above the launch point", () => {
    const game = new GameSimulation({ seed: 441, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([
      {
        id: 1, x: 80, y: 260, width: 96, kind: "spring",
        variant: "spring", direction: 1, phase: 0, collidable: true,
        activationState: "triggered"
      },
      {
        id: 2, x: 80, y: 230, width: 96, kind: "normal",
        variant: "normal", direction: 1, phase: 0, collidable: true
      }
    ]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, standingPlatformId: 1, onPlatformSince: 0
    });
    let crossedAbovePlatform = false;
    for (let elapsed = 0; elapsed < 1000; elapsed += 20) {
      game.step(idle, 20);
      const state = game.snapshot();
      const player = state.players[0];
      const previousRow = state.platforms.find((platform) => platform.id === 2)!;
      if (player.y < previousRow.y) crossedAbovePlatform = true;
      expect(player.standingPlatformId).not.toBe(2);
    }
    expect(crossedAbovePlatform).toBe(true);
  });

  test("spring descent lands on the next lower block while platforms keep scrolling", () => {
    const game = new GameSimulation({ seed: 442, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([
      {
        id: 3, x: 80, y: 140, width: 96, kind: "normal",
        variant: "normal", direction: 1, phase: 0, collidable: true
      },
      {
        id: 1, x: 80, y: 200, width: 96, kind: "spring",
        variant: "spring", direction: 1, phase: 0, collidable: true,
        activationState: "active"
      },
      {
        id: 2, x: 80, y: 260, width: 200, kind: "normal",
        variant: "normal", direction: 1, phase: 0, collidable: true
      }
    ]);
    game.debugSetPlayer(0, {
      x: 120, y: 200, vy: 0, standingPlatformId: 1,
      onPlatformSince: 0, springLaunchAtMs: 100,
      springLaunchPlatformId: 1
    });

    let launched = false;
    let ignoredAtLaunch: number[] = [];
    let landedPlatformId: number | null = null;
    for (let elapsed = 0; elapsed < 1200; elapsed += 20) {
      const input = elapsed < 400
        ? { ...idle, players: [{ left: false, right: true }, idle.players[1]] } as InputFrame
        : idle;
      game.step(input, 20);
      const player = game.snapshot().players[0];
      if (player.vy < 0 && player.standingPlatformId === null && !launched) {
        launched = true;
        ignoredAtLaunch = player.springIgnoredPlatformIds;
      }
      if (launched && player.standingPlatformId !== null) {
        landedPlatformId = player.standingPlatformId;
        break;
      }
    }

    expect(launched).toBe(true);
    expect(ignoredAtLaunch).toEqual([1, 3]);
    expect(landedPlatformId).toBe(2);
    expect(game.snapshot().players[0].springIgnoredPlatformIds).toEqual([]);
  });

  test("can land on and relaunch from the same spring repeatedly", () => {
    const game = new GameSimulation({ seed: 447, difficulty: "hard", players: 1 });
    game.debugSetPlatforms([{
      id: 1, x: 80, y: 260, width: 96, kind: "spring",
      variant: "spring", direction: 1, phase: 0, collidable: true,
      activationState: "active"
    }]);
    game.debugSetPlayer(0, {
      x: 120, y: 260, vy: 0, standingPlatformId: 1,
      onPlatformSince: 0, springLaunchAtMs: 100,
      springLaunchPlatformId: 1
    });

    let launches = 0;
    let landedBackOnSource = false;
    for (let elapsed = 0; elapsed < 1800; elapsed += 20) {
      game.step(idle, 20);
      launches += game.drainEvents().filter((event) => event.type === "spring").length;
      const player = game.snapshot().players[0];
      if (launches === 1 && player.standingPlatformId === 1) landedBackOnSource = true;
      if (launches === 2) break;
    }

    expect(landedBackOnSource).toBe(true);
    expect(launches).toBe(2);
  });

  test("clears spring ignored platforms after landing on another player", () => {
    const game = new GameSimulation({ seed: 443, difficulty: "hard", players: 2 });
    game.debugSetPlatforms([]);
    game.debugSetPlayer(0, {
      x: 120, y: 220, vy: 1, standingPlatformId: null,
      springIgnoredPlatformIds: [4, 5]
    });
    game.debugSetPlayer(1, {
      x: 120, y: 260, vy: 0, standingPlatformId: null
    });

    game.step(idle, 20);

    expect(game.snapshot().players[0].standingPlayerId).toBe(1);
    expect(game.snapshot().players[0].springIgnoredPlatformIds).toEqual([]);
  });

  test("clears spring ignored platforms after death or a ceiling hit", () => {
    const death = new GameSimulation({ seed: 445, difficulty: "hard", players: 1 });
    death.debugSetPlatforms([]);
    death.debugSetPlayer(0, { y: 370, vy: 1, springIgnoredPlatformIds: [1] });
    death.step(idle, 20);
    expect(death.snapshot().players[0]).toMatchObject({
      alive: false,
      springIgnoredPlatformIds: []
    });

    const ceiling = new GameSimulation({ seed: 446, difficulty: "hard", players: 1 });
    ceiling.debugSetPlatforms([]);
    ceiling.debugSetPlayer(0, {
      y: 20, vy: -1, springIgnoredPlatformIds: [1],
      springLaunchAtMs: 100, springLaunchPlatformId: 1
    });
    ceiling.step(idle, 20);
    expect(ceiling.snapshot().players[0]).toMatchObject({
      springIgnoredPlatformIds: [],
      springLaunchAtMs: null,
      springLaunchPlatformId: null
    });
  });

  test("holds the player for 100ms, then drops them for a 250ms roll and resets", () => {
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
    game.step(idle, 99);
    expect(game.snapshot().players[0].standingPlatformId).toBe(1);
    expect(game.snapshot().platforms[0].collidable).toBe(true);
    game.step(idle, 1);
    expect(game.snapshot().players[0].standingPlatformId).toBeNull();
    expect(game.snapshot().platforms[0]).toMatchObject({
      activationState: "disappearing", collidable: false, activationAgeMs: 100
    });
    game.step(idle, 230);
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

  test("applies asymmetric conveyor assistance for idle, same and opposing input", () => {
    const move = (variant: "conveyor-left" | "conveyor-right", left: boolean, right: boolean) => {
      const game = new GameSimulation({ seed: 480, difficulty: "normal", players: 1 });
      game.debugSetPlatforms([{
        id: 1, x: 40, y: 260, width: 300, kind: "conveyor",
        variant, direction: variant === "conveyor-left" ? -1 : 1,
        phase: 0, collidable: true
      }]);
      game.debugSetPlayer(0, { x: 180, y: 260, standingPlatformId: 1, vx: 0 });
      game.step({ ...idle, players: [{ left, right }, idle.players[1]] }, 100);
      return game.snapshot().players[0].x - 180;
    };
    expect(move("conveyor-right", false, false)).toBeCloseTo(10);
    expect(move("conveyor-right", false, true)).toBeCloseTo(35);
    expect(move("conveyor-right", true, false)).toBeCloseTo(-15);
    expect(move("conveyor-left", true, false)).toBeCloseTo(-35);
    expect(move("conveyor-left", false, true)).toBeCloseTo(15);
  });

  test("lands on the first crossed platform even when platform storage order differs", () => {
    const game = new GameSimulation({ seed: 481, difficulty: "normal", players: 1 });
    game.debugSetPlatforms([
      { id: 1, x: 80, y: 260, width: 96, kind: "normal", direction: 1, phase: 0, collidable: true },
      { id: 2, x: 80, y: 220, width: 96, kind: "normal", direction: 1, phase: 0, collidable: true }
    ]);
    game.debugSetPlayer(0, { x: 120, y: 200, vy: 4, standingPlatformId: null });
    game.step(idle, 20);
    expect(game.snapshot().players[0].standingPlatformId).toBe(2);
    expect(game.snapshot().players[0].y).toBeCloseTo(game.snapshot().platforms[1].y);
  });

  test("never repeats an exact variant or generates more than two special rows", () => {
    const game = new GameSimulation({ seed: 482, difficulty: "hard", players: 1 });
    const generated = new Map<number, string>();
    for (let elapsed = 0; elapsed < 300_000; elapsed += 100) {
      game.debugSetPlayer(0, { y: 180, vy: 0, health: 12, alive: true });
      game.step(idle, 100);
      for (const platform of game.snapshot().platforms) {
        if (platform.sequence > 0) generated.set(platform.sequence, platform.variant);
      }
    }
    const variants = [...generated.entries()].sort(([a], [b]) => a - b).map(([, variant]) => variant);
    expect(variants.length).toBeGreaterThan(100);
    for (let index = 1; index < variants.length; index += 1) {
      if (variants[index] !== "normal") {
        expect(variants[index]).not.toBe(variants[index - 1]);
      }
    }
    for (let index = 2; index < variants.length; index += 1) {
      expect(variants.slice(index - 2, index + 1)).toContain("normal");
    }
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
