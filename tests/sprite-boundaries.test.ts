import { describe, expect, test } from "vitest";
import { SPRITE_ATLAS } from "../src/game/atlas";

describe("packed bitmap source boundaries", () => {
  test("keeps complete native 32x32 character and hurt frames", () => {
    for (const color of ["yellow", "green"] as const) {
      expect(SPRITE_ATLAS.players[color]).toHaveLength(20);
      expect(SPRITE_ATLAS.hurtPlayers[color]).toHaveLength(20);
      expect([...SPRITE_ATLAS.players[color], ...SPRITE_ATLAS.hurtPlayers[color]]
        .every((frame) =>
        frame.width === 32 && frame.height === 32
      )).toBe(true);
    }
  });

  test("renders platform objects from a separated transparent atlas", () => {
    expect(SPRITE_ATLAS.nativeImage).toBe(`${import.meta.env.BASE_URL}assets/web/sprites-native.png`);
    for (const frame of Object.values(SPRITE_ATLAS.platformAnimations).flat()) {
      expect(frame.source).toBe("native");
    }
  });

  test("records the native non-uniform frame dimensions", () => {
    expect(SPRITE_ATLAS.platformAnimations.normal.map(({ width, height }) =>
      `${width}x${height}`)).toEqual(["96x16"]);
    expect(SPRITE_ATLAS.platformAnimations.rotating.map(({ width, height }) =>
      `${width}x${height}`)).toEqual([
      "96x16", "96x29", "96x36", "96x32", "96x35", "96x30"
    ]);
    expect(SPRITE_ATLAS.platformAnimations.spring.map(({ width, height }) =>
      `${width}x${height}`)).toEqual([
      "96x23", "96x21", "96x20", "96x18", "96x16", "96x14", "96x12"
    ]);
    expect(SPRITE_ATLAS.platformAnimations.spike.map(({ width, height }) =>
      `${width}x${height}`)).toEqual(["96x32"]);
  });

  test("keeps separate four-frame left and right conveyor sequences", () => {
    expect(SPRITE_ATLAS.platformAnimations.conveyorRight.map(({ x, y }) => [x, y]))
      .toEqual(Array.from({ length: 4 }, (_, index) => [288, 16 + index * 16]));
    expect(SPRITE_ATLAS.platformAnimations.conveyorLeft.map(({ x, y }) => [x, y]))
      .toEqual(Array.from({ length: 4 }, (_, index) => [288, 80 + index * 16]));
  });

  test("retains every platform's original bitmap-101 coordinates", () => {
    expect(SPRITE_ATLAS.platformAnimations.normal[0]).toMatchObject({
      source: "native", x: 288, y: 0, width: 96, height: 16
    });
    expect(SPRITE_ATLAS.platformAnimations.rotating[0]).toMatchObject({
      source: "native", x: 288, y: 154, width: 96, height: 16
    });
    expect(SPRITE_ATLAS.platformAnimations.spring[0]).toMatchObject({
      source: "native", x: 384, y: 208, width: 96, height: 23
    });
    expect(SPRITE_ATLAS.platformAnimations.spike[0]).toMatchObject({
      source: "native", x: 384, y: 368, width: 96, height: 32
    });
  });
});
