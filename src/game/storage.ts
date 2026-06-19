import type { SaveData } from "./types";
import { normalizePlayerName } from "./player-name";

export const SAVE_KEY = "ns-shaft-browser-save-v1";

export function createDefaultSave(): SaveData {
  return {
    version: 2,
    settings: {
      difficulty: "normal",
      music: true,
      sound: true,
      fast: false,
      conveyor: true,
      spring: true,
      rotating: true
    },
    lastInputName: "PLAYER1",
    playerNames: ["PLAYER1", "PLAYER2"]
  };
}

export function loadSave(raw: string | null): SaveData {
  if (!raw) return createDefaultSave();
  try {
    const parsed = JSON.parse(raw) as Omit<Partial<SaveData>, "version" | "playerNames"> & {
      version?: number;
      playerNames?: unknown[];
    };
    if ((parsed.version !== 1 && parsed.version !== 2) || !parsed.settings) {
      return createDefaultSave();
    }
    const defaults = createDefaultSave();
    const names = Array.isArray(parsed.playerNames) ? parsed.playerNames : [parsed.lastInputName, undefined];
    return {
      ...defaults,
      version: 2,
      settings: { ...defaults.settings, ...parsed.settings },
      lastInputName: normalizePlayerName(String(parsed.lastInputName ?? names[0] ?? ""), "PLAYER1"),
      playerNames: [
        normalizePlayerName(String(names[0] ?? ""), "PLAYER1"),
        normalizePlayerName(String(names[1] ?? ""), "PLAYER2")
      ]
    } as SaveData;
  } catch {
    return createDefaultSave();
  }
}
