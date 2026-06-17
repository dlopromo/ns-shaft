import { describe, expect, test } from "vitest";
import {
  playerNeedsMirror, rotatingFrameIndex, springFrameIndex
} from "../src/game/renderer";

describe("native platform animation timing", () => {
  test("compresses through seven spring frames then rebounds to the first", () => {
    expect([0, 23, 46, 69, 92, 115, 159].map(springFrameIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([160, 176, 192, 208, 224, 239].map(springFrameIndex))
      .toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("shows visible rotation immediately after the 150ms hold", () => {
    expect([0, 40, 80, 120, 160, 200, 239].map(rotatingFrameIndex))
      .toEqual([1, 2, 3, 4, 5, 0, 0]);
    expect(rotatingFrameIndex(240)).toBe(0);
  });

  test("mirrors the native left-facing character only when moving right", () => {
    expect(playerNeedsMirror("left")).toBe(false);
    expect(playerNeedsMirror("right")).toBe(true);
  });
});
