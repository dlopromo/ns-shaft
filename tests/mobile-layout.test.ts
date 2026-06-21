import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  mobileOrientationForViewport,
  mobilePrimaryAction,
  mobileScaleForViewport
} from "../src/game/mobile";

describe("mobile layout helpers", () => {
  test("separates half-width directions from the bottom action bar", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    expect(main).toContain('id="mobile-directions"');
    expect(main.indexOf('id="mobile-directions"')).toBeLessThan(main.indexOf('class="mobile-actions"'));
    expect(css).toMatch(/\.mobile-directions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    expect(css).toMatch(/\.mobile-direction\s*\{[^}]*width:\s*100%;[^}]*height:\s*96px/s);
  });

  test("keeps mobile dialogs selectable only inside form controls", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.mobile-shell \.dialog-screen:not\(\[hidden\]\)[^{]*\{[^}]*user-select:\s*none/s);
    expect(css).toMatch(/\.mobile-shell :is\(input, select, textarea\)\s*\{[^}]*user-select:\s*text/s);
  });

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
