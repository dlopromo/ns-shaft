import { describe, expect, test } from "vitest";
import {
  playerNeedsMirror, rotatingFrameIndex, springFrameIndex
} from "../src/game/renderer";

describe("native platform animation timing", () => {
  test("compresses through seven spring frames then rebounds to the first", () => {
    expect([0, 29, 58, 87, 116, 145, 199].map(springFrameIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([200, 220, 240, 260, 280, 299].map(springFrameIndex))
      .toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("shows visible rotation immediately after the 200ms hold", () => {
    expect([0, 50, 100, 150, 200, 250, 299].map(rotatingFrameIndex))
      .toEqual([1, 2, 3, 4, 5, 0, 0]);
    expect(rotatingFrameIndex(300)).toBe(0);
  });

  test("mirrors the native left-facing character only when moving right", () => {
    expect(playerNeedsMirror("left")).toBe(false);
    expect(playerNeedsMirror("right")).toBe(true);
  });
});
