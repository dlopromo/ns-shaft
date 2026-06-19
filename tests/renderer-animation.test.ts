import { describe, expect, test } from "vitest";
import {
  playerNeedsMirror, playerRenderColor, rotatingFrameIndex, springFrameIndex
} from "../src/game/renderer";

describe("native platform animation timing", () => {
  test("compresses through seven spring frames then rebounds to the first", () => {
    expect([0, 15, 30, 45, 60, 75, 99].map(springFrameIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([100, 120, 140, 160, 180, 199].map(springFrameIndex))
      .toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("completes the six-frame rotation in 250ms", () => {
    expect([0, 42, 84, 126, 168, 210, 249].map(rotatingFrameIndex))
      .toEqual([1, 2, 3, 4, 5, 0, 0]);
    expect(rotatingFrameIndex(250)).toBe(0);
  });

  test("mirrors the native left-facing character only when moving right", () => {
    expect(playerNeedsMirror("left")).toBe(false);
    expect(playerNeedsMirror("right")).toBe(true);
  });

  test("can render an opponent with the native 2P color without changing state", () => {
    expect(playerRenderColor("yellow", undefined)).toBe("yellow");
    expect(playerRenderColor("yellow", "green")).toBe("green");
    expect(playerRenderColor("green", "yellow")).toBe("yellow");
  });
});
