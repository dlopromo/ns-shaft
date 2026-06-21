import { describe, expect, test } from "vitest";
import { GAME_LAYOUT, integerScaleForViewport } from "../src/game/layout";
import { readFileSync } from "node:fs";

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
    expect(GAME_LAYOUT.playable).toEqual({
      x: 16,
      y: 16,
      width: 388,
      height: 340
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
      floorSuffix: { x: 388, y: 12 },
      twoPlayer: {
        left: {
          playerLabel: { x: 32, y: 11 },
          lifeLabel: { x: 71, y: 12 },
          lifeBar: { x: 32, y: 28 }
        },
        right: {
          playerLabel: { x: 336, y: 11 },
          lifeLabel: { x: 370, y: 12 },
          lifeBar: { x: 336, y: 28 }
        },
        floorPrefix: { x: 133, y: 12 },
        floorDigits: { x: 201, y: 12, step: 30 },
        floorSuffix: { x: 297, y: 12 }
      }
    });
    expect(GAME_LAYOUT.sidebar.difficultyValue).toEqual({ right: 609, y: 113 });
    expect(GAME_LAYOUT.sidebar.recordDigits).toEqual({
      x: 541, y: 165, step: 13
    });
  });

  test("uses integer-only fullscreen scaling", () => {
    expect(integerScaleForViewport(1268, 872)).toBe(2);
    expect(integerScaleForViewport(1901, 1307)).toBe(2);
    expect(integerScaleForViewport(500, 400)).toBe(1);
  });

  test("keeps the title panel native-sized with a full-width language selector", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.title-screen::before\s*\{[^}]*width:\s*360px;[^}]*height:\s*330px;/s);
    expect(css).toMatch(/\.title-language select\s*\{[^}]*width:\s*120px;[^}]*height:\s*22px;/s);
    expect(css).toMatch(/\.title-art\s*\{[^}]*width:\s*288px;[^}]*height:\s*140px;/s);
  });

  test("keeps BEST 5 centered with fixed record columns", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.records-screen\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s);
    expect(css).toMatch(/\.records-content\s*\{[^}]*width:\s*390px;[^}]*margin:\s*0;/s);
    expect(css).toMatch(/\.record-row\s*\{[^}]*grid-template-columns:\s*18px minmax\(0, 1fr\) 58px;/s);
    expect(css).toMatch(/\.record-player\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
  });

  test("uses one stable online lobby layout for every locale", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(css).toMatch(/\.online-room-header\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
    expect(css).toMatch(/\.online-room-settings\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).not.toMatch(/html\[lang="(?:en|zh-Hant)"\] \.online-room-settings/);
    expect(main.match(/<span data-online-header/g)).toHaveLength(3);
    expect(main).toContain('<select id="online-room-mode">');
    expect(main).toContain('<select id="online-difficulty">');
    expect(main).toContain('<option value="normal" selected');
    expect(main).toContain('id="online-start"');
    expect(main).toContain('id="online-status" hidden');
  });

  test("renders online results as structured Windows-style rows", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toContain('id="online-result"');
    expect(main).toContain('data-result="score"');
    expect(main).toContain('data-result="placement"');
    expect(main).toContain('data-result="rank"');
    expect(main).toContain('data-result="next"');
    expect(css).toMatch(/\.online-result-score\s*\{[^}]*background:\s*#ffe28a;/s);
    expect(css).toMatch(/\.online-result-row\[data-success="true"\]\s*\{[^}]*background:\s*#9ce3a5;/s);
  });

  test("renders start and resume countdowns as a full-screen overlay", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(css).toMatch(/\.online-state\[data-countdown="true"\] \.online-state-dialog\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
    expect(css).toMatch(/\.online-state\[data-countdown="true"\] h2\s*\{[^}]*font-size:\s*96px;/s);
    expect(main).toContain('onlineState.dataset.countdown = String(options.countdown === true)');
  });
});
