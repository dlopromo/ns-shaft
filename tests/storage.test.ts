import { describe, expect, test } from "vitest";
import { createDefaultSave, loadSave } from "../src/game/storage";

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
      conveyor: true, spring: true, rotating: true
    });
    expect(save.version).toBe(2);
    expect(save.playerNames).toEqual(["PLAYER1", "PLAYER2"]);
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
