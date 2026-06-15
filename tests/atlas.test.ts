import { describe, expect, test } from "vitest";
import { SPRITE_ATLAS } from "../src/game/atlas";

describe("original Windows sprite atlas", () => {
  test("maps both players, every platform and HUD artwork to bitmap 101", () => {
    expect(SPRITE_ATLAS.players.yellow.length).toBeGreaterThanOrEqual(8);
    expect(SPRITE_ATLAS.players.green.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(SPRITE_ATLAS.platforms).sort()).toEqual([
      "conveyor", "normal", "rotating", "spike", "spring"
    ]);
    expect(SPRITE_ATLAS.pause.source).toBe("main");
    expect(SPRITE_ATLAS.gameOver.source).toBe("main");
  });

  test("defines foot anchors, collision boxes and mirror-only left facing", () => {
    for (const color of ["yellow", "green"] as const) {
      expect(SPRITE_ATLAS.players[color]).toHaveLength(20);
      expect(SPRITE_ATLAS.hurtPlayers[color]).toHaveLength(20);
      for (const [index, sprite] of SPRITE_ATLAS.players[color].entries()) {
        expect(sprite.source).toBe("native");
        expect(sprite.x).toBe((index % 4) * 32);
        expect(sprite.y).toBe(
          (color === "yellow" ? 0 : 160) + Math.floor(index / 4) * 32
        );
        expect(sprite.anchor).toEqual({ x: 16, y: 32 });
        expect(sprite.collision).toEqual({ x: 3, y: 6, width: 26, height: 26 });
        expect(sprite.mirrorX).toBe(false);
        expect(sprite.width).toBe(32);
        expect(sprite.height).toBe(32);
      }
    }
  });

  test("keeps the five four-frame character poses separate", () => {
    expect(Object.keys(SPRITE_ATLAS.playerAnimations)).toEqual([
      "walk", "jump", "side", "stand", "dead"
    ]);
    for (const [name, frames] of Object.entries(SPRITE_ATLAS.playerAnimations)) {
      if (name === "stand") continue;
      expect(frames).toHaveLength(4);
      expect(new Set(frames)).toHaveLength(4);
    }
    expect(SPRITE_ATLAS.playerAnimations.stand).toHaveLength(1);
  });

  test("defines original multi-frame sequences for animated platform objects", () => {
    expect(SPRITE_ATLAS.platformAnimations.conveyorLeft).toHaveLength(4);
    expect(SPRITE_ATLAS.platformAnimations.conveyorRight).toHaveLength(4);
    expect(SPRITE_ATLAS.platformAnimations.rotating).toHaveLength(6);
    expect(SPRITE_ATLAS.platformAnimations.spring).toHaveLength(7);
    expect(SPRITE_ATLAS.platformAnimations.spike.length).toBeGreaterThanOrEqual(1);
    for (const frames of Object.values(SPRITE_ATLAS.platformAnimations)) {
      expect(frames.every((frame) => frame.width === 96)).toBe(true);
    }
  });

  test("keeps all source rectangles inside the extracted bitmap", () => {
    const sprites = [
      ...SPRITE_ATLAS.players.yellow,
      ...SPRITE_ATLAS.players.green,
      ...Object.values(SPRITE_ATLAS.platforms),
      ...Object.values(SPRITE_ATLAS.platformAnimations).flat(),
      SPRITE_ATLAS.pause,
      SPRITE_ATLAS.gameOver,
      SPRITE_ATLAS.ceiling
    ];
    for (const sprite of sprites) {
      const sourceWidth = 544;
      const sourceHeight = 400;
      expect(sprite.x).toBeGreaterThanOrEqual(0);
      expect(sprite.y).toBeGreaterThanOrEqual(0);
      expect(sprite.x + sprite.width).toBeLessThanOrEqual(sourceWidth);
      expect(sprite.y + sprite.height).toBeLessThanOrEqual(sourceHeight);
    }
  });

  test("maps the complete original gameplay UI sprites", () => {
    expect(SPRITE_ATLAS.ceiling).toMatchObject({
      source: "main", x: 0, y: 368, width: 384, height: 16
    });
    expect(SPRITE_ATLAS.wall).toMatchObject({
      source: "main", x: 512, y: 0, width: 16, height: 32
    });
    expect(SPRITE_ATLAS.lifeBars).toHaveLength(11);
    expect(SPRITE_ATLAS.lifeBars.map(({ x, y, width, height }) =>
      [x, y, width, height]
    )).toEqual(Array.from({ length: 11 }, (_, index) =>
      [384, index * 16, 96, 16]
    ));
    expect(SPRITE_ATLAS.floorPrefix).toMatchObject({
      x: 128, y: 320, width: 64, height: 32
    });
    expect(SPRITE_ATLAS.floorSuffix).toMatchObject({
      x: 192, y: 320, width: 32, height: 32
    });
    expect(SPRITE_ATLAS.difficultyLabels.map(({ x, y, width, height }) =>
      [x, y, width, height]
    )).toEqual([
      [0, 384, 96, 16],
      [96, 384, 96, 16],
      [192, 384, 96, 16]
    ]);
    expect(SPRITE_ATLAS.smallDigits.map(({ x, y, width, height }) =>
      [x, y, width, height]
    )).toEqual([
      [272, 224, 16, 13], [272, 237, 16, 14],
      [272, 252, 16, 13], [272, 266, 16, 14],
      [272, 280, 16, 13], [272, 294, 16, 14],
      [272, 308, 16, 14], [272, 322, 16, 13],
      [272, 336, 16, 14], [272, 350, 16, 14]
    ]);
  });
});
