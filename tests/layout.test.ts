import { describe, expect, test } from "vitest";
import { GAME_LAYOUT, integerScaleForViewport } from "../src/game/layout";

describe("Windows 1.3J native layout", () => {
  test("uses the unscaled 634x436 resource frame", () => {
    expect(GAME_LAYOUT.frame).toEqual({ width: 634, height: 436 });
    expect(GAME_LAYOUT.scale).toBe(1);
  });

  test("places the game viewport inside bitmap 106's left frame", () => {
    expect(GAME_LAYOUT.playfield).toEqual({
      x: 22,
      y: 62,
      width: 420,
      height: 356
    });
  });

  test("keeps HUD and status controls outside the playfield", () => {
    expect(GAME_LAYOUT.hud.lifeLabel.y).toBeLessThan(GAME_LAYOUT.playfield.y);
    expect(GAME_LAYOUT.hud.floorPrefix.y).toBeLessThan(GAME_LAYOUT.playfield.y);
    expect(GAME_LAYOUT.sidebar.x).toBeGreaterThanOrEqual(
      GAME_LAYOUT.playfield.x + GAME_LAYOUT.playfield.width
    );
    expect(GAME_LAYOUT.sidebar.pause.y).toBeLessThan(GAME_LAYOUT.sidebar.abort.y);
  });

  test("uses the original 1.3J HUD and sidebar sprite positions", () => {
    expect(GAME_LAYOUT.hud).toEqual({
      lifeLabel: { x: 71, y: 12 },
      lifeBar: { x: 46, y: 28 },
      floorPrefix: { x: 194, y: 12 },
      floorDigits: { x: 262, y: 12, step: 30 },
      floorSuffix: { x: 374, y: 12 }
    });
    expect(GAME_LAYOUT.sidebar.difficultyValue).toEqual({ x: 506, y: 112 });
    expect(GAME_LAYOUT.sidebar.recordDigits).toEqual({
      x: 541, baselineY: 174, step: 13
    });
  });

  test("uses integer-only fullscreen scaling", () => {
    expect(integerScaleForViewport(1268, 872)).toBe(2);
    expect(integerScaleForViewport(1901, 1307)).toBe(2);
    expect(integerScaleForViewport(500, 400)).toBe(1);
  });
});
