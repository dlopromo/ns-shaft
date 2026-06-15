import { describe, expect, test } from "vitest";
import { createDefaultSave, loadSave, recordScore } from "../src/game/storage";

describe("save data", () => {
  test("falls back when persisted JSON is corrupt", () => {
    expect(loadSave("{broken")).toEqual(createDefaultSave());
  });

  test("keeps only the best five scores per difficulty", () => {
    let save = createDefaultSave();
    for (const score of [3, 9, 2, 11, 7, 5]) {
      save = recordScore(save, "normal", { name: "AAA", floor: score });
    }
    expect(save.records.normal.map((entry) => entry.floor)).toEqual([11, 9, 7, 5, 3]);
  });

  test("does not mutate the original save object", () => {
    const save = createDefaultSave();
    recordScore(save, "easy", { name: "P1", floor: 12 });
    expect(save.records.easy).toHaveLength(0);
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
  });
});
