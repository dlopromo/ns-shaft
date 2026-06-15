import type { Difficulty, SaveData, ScoreEntry } from "./types";

export const SAVE_KEY = "ns-shaft-browser-save-v1";

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    settings: {
      difficulty: "normal",
      music: true,
      sound: true,
      fast: false,
      conveyor: true,
      spring: true,
      rotating: true
    },
    records: { easy: [], normal: [], hard: [] },
    lastInputName: "PLAYER"
  };
}

export function loadSave(raw: string | null): SaveData {
  if (!raw) return createDefaultSave();
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1 || !parsed.settings || !parsed.records) return createDefaultSave();
    const defaults = createDefaultSave();
    return {
      ...defaults,
      ...parsed,
      settings: { ...defaults.settings, ...parsed.settings },
      records: { ...defaults.records, ...parsed.records }
    } as SaveData;
  } catch {
    return createDefaultSave();
  }
}

export function recordScore(save: SaveData, difficulty: Difficulty, entry: ScoreEntry): SaveData {
  const records = {
    easy: [...save.records.easy],
    normal: [...save.records.normal],
    hard: [...save.records.hard]
  };
  records[difficulty] = [...records[difficulty], entry]
    .sort((a, b) => b.floor - a.floor)
    .slice(0, 5);
  return { ...save, records };
}
