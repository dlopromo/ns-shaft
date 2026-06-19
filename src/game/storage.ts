import type { Locale, SaveData } from "./types";
import { normalizePlayerName } from "./player-name";

export const SAVE_KEY = "ns-shaft-browser-save-v1";

export function createDefaultSave(): SaveData {
  return {
    version: 3,
    settings: {
      difficulty: "normal",
      music: true,
      sound: true,
      fast: false,
      conveyor: true,
      spring: true,
      rotating: true,
      locale: "ja"
    },
    lastInputName: "PLAYER1",
    playerNames: ["PLAYER1", "PLAYER2"]
  };
}

export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith("zh")) return "zh-Hant";
    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("ja")) return "ja";
  }
  return "ja";
}

export function loadSave(raw: string | null, browserLanguages: readonly string[] = []): SaveData {
  const detectedLocale = detectLocale(browserLanguages);
  if (!raw) return { ...createDefaultSave(), settings: {
    ...createDefaultSave().settings, locale: detectedLocale
  } };
  try {
    const parsed = JSON.parse(raw) as Omit<Partial<SaveData>, "version" | "playerNames"> & {
      version?: number;
      playerNames?: unknown[];
    };
    if ((parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) || !parsed.settings) {
      return createDefaultSave();
    }
    const defaults = createDefaultSave();
    const names = Array.isArray(parsed.playerNames) ? parsed.playerNames : [parsed.lastInputName, undefined];
    return {
      ...defaults,
      version: 3,
      settings: {
        ...defaults.settings,
        ...parsed.settings,
        locale: isLocale((parsed.settings as Partial<SaveData["settings"]>).locale)
          ? (parsed.settings as Partial<SaveData["settings"]>).locale as Locale
          : detectedLocale
      },
      lastInputName: normalizePlayerName(String(parsed.lastInputName ?? names[0] ?? ""), "PLAYER1"),
      playerNames: [
        normalizePlayerName(String(names[0] ?? ""), "PLAYER1"),
        normalizePlayerName(String(names[1] ?? ""), "PLAYER2")
      ]
    } as SaveData;
  } catch {
    return { ...createDefaultSave(), settings: {
      ...createDefaultSave().settings, locale: detectedLocale
    } };
  }
}

function isLocale(value: unknown): value is Locale {
  return value === "ja" || value === "zh-Hant" || value === "en";
}
