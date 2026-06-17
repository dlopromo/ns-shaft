import { describe, expect, test } from "vitest";
import { AUDIO_EFFECTS, AUDIO_MANIFEST } from "../src/game/audio";

describe("original audio manifest", () => {
  test("maps all nine WAVE resources to game events", () => {
    expect(Object.keys(AUDIO_MANIFEST.effects)).toHaveLength(9);
    expect(new Set(Object.values(AUDIO_MANIFEST.effects))).toHaveLength(9);
    expect(AUDIO_EFFECTS.map(({ event }) => event)).toEqual(Object.keys(AUDIO_MANIFEST.effects));
  });

  test("retains the original MIDI as the music source", () => {
    expect(AUDIO_MANIFEST.music).toBe(`${import.meta.env.BASE_URL}assets/BGM.MID`);
  });

  test("exposes each extracted WAVE resource for manual preview", () => {
    expect(AUDIO_EFFECTS.map(({ resourceId, durationMs }) => ({
      resourceId,
      durationMs: Math.round(durationMs)
    }))).toEqual([
      { resourceId: 107, durationMs: 272 },
      { resourceId: 108, durationMs: 320 },
      { resourceId: 109, durationMs: 439 },
      { resourceId: 110, durationMs: 442 },
      { resourceId: 111, durationMs: 1083 },
      { resourceId: 112, durationMs: 1775 },
      { resourceId: 113, durationMs: 1812 },
      { resourceId: 114, durationMs: 802 },
      { resourceId: 115, durationMs: 1380 }
    ]);
  });
});
