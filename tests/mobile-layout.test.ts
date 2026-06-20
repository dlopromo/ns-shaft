import { describe, expect, test } from "vitest";
import {
  mobileOrientationForViewport,
  mobilePrimaryAction,
  mobileScaleForViewport
} from "../src/game/mobile";

describe("mobile layout helpers", () => {
  test("detects portrait and landscape from viewport dimensions", () => {
    expect(mobileOrientationForViewport(390, 844)).toBe("portrait");
    expect(mobileOrientationForViewport(844, 390)).toBe("landscape");
  });

  test("allows fractional portrait scale while keeping cabinet within width", () => {
    const scale = mobileScaleForViewport(390, 844);
    expect(scale).toBeLessThan(1);
    expect(634 * scale + 20).toBeLessThanOrEqual(374);
  });

  test("reserves portrait control height", () => {
    const scale = mobileScaleForViewport(360, 640, { controlsHeight: 184 });
    expect(436 * scale).toBeLessThanOrEqual(640 - 184);
  });

  test("keeps a landscape control column", () => {
    const scale = mobileScaleForViewport(844, 390, { landscapeControlsWidth: 180 });
    expect(634 * scale).toBeLessThanOrEqual(648);
    expect(436 * scale + 20).toBeLessThanOrEqual(378);
  });

  test("maps local game states to the primary mobile action", () => {
    expect(mobilePrimaryAction("playing", false)).toBe("pause");
    expect(mobilePrimaryAction("paused", false)).toBe("resume");
    expect(mobilePrimaryAction("gameover", false)).toBe("retry");
  });

  test("disables the primary action while an online overlay owns the flow", () => {
    expect(mobilePrimaryAction("playing", true)).toBe("disabled");
  });
});
