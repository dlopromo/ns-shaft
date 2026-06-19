import { describe, expect, test } from "vitest";
import { createDefaultSave, detectLocale, loadSave } from "../src/game/storage";

describe("save data", () => {
  test("falls back when persisted JSON is corrupt", () => {
    expect(loadSave("{broken")).toEqual(createDefaultSave());
  });

  test("merges a partial version-one save with current setting defaults", () => {
    const save = loadSave(JSON.stringify({
      version: 1,
      settings: { difficulty: "hard", music: false },
      records: { easy: [], normal: [], hard: [] }
    }));
    expect(save.settings).toMatchObject({
      difficulty: "hard", music: false, sound: true, fast: false,
      conveyor: true, spring: true, rotating: true, locale: "ja"
    });
    expect(save.version).toBe(3);
    expect(save.playerNames).toEqual(["PLAYER1", "PLAYER2"]);
  });

  test("persists supported locales and falls back to Japanese", () => {
    const english = loadSave(JSON.stringify({
      ...createDefaultSave(),
      settings: { ...createDefaultSave().settings, locale: "en" }
    }));
    expect(english.settings.locale).toBe("en");
    const invalid = loadSave(JSON.stringify({
      ...createDefaultSave(),
      settings: { ...createDefaultSave().settings, locale: "fr" }
    }));
    expect(invalid.settings.locale).toBe("ja");
  });

  test("detects the first supported browser language for a new player", () => {
    expect(detectLocale(["zh-HK", "en-US"])).toBe("zh-Hant");
    expect(detectLocale(["en-GB", "ja-JP"])).toBe("en");
    expect(detectLocale(["fr-FR", "de-DE"])).toBe("ja");
    expect(loadSave(null, ["zh-TW"]).settings.locale).toBe("zh-Hant");
  });

  test("keeps a saved locale ahead of browser language", () => {
    const saved = loadSave(JSON.stringify({
      ...createDefaultSave(),
      settings: { ...createDefaultSave().settings, locale: "en" }
    }), ["zh-HK"]);
    expect(saved.settings.locale).toBe("en");
  });

  test("normalizes persisted player names to eight uppercase alphanumerics", () => {
    const save = loadSave(JSON.stringify({
      ...createDefaultSave(),
      playerNames: ["alice!?long", "bob-2"]
    }));
    expect(save.playerNames).toEqual(["ALICELON", "BOB2"]);
  });

  test("migrates version-one settings while ignoring legacy local records", () => {
    const save = loadSave(JSON.stringify({
      version: 1,
      settings: createDefaultSave().settings,
      records: { normal: [{ name: "OLD", floor: 99 }] },
      lastInputName: "old"
    }));
    expect(save).not.toHaveProperty("records");
    expect(save.playerNames[0]).toBe("OLD");
  });
});
