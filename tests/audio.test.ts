import { describe, expect, test } from "vitest";
import { AUDIO_EFFECTS, AUDIO_MANIFEST, MUSIC_MASTER_GAIN } from "../src/game/audio";

describe("original audio manifest", () => {
  test("maps previewed WAVE resources to game events", () => {
    expect(Object.keys(AUDIO_MANIFEST.effects)).toHaveLength(10);
    expect(AUDIO_EFFECTS.map(({ event }) => event)).toEqual(Object.keys(AUDIO_MANIFEST.effects));
    expect(Object.fromEntries(AUDIO_EFFECTS.map(({ event, resourceId }) =>
      [event, resourceId]
    ))).toEqual({
      land: 107,
      heal: 108,
      hurt: 110,
      spring: 109,
      conveyor: 107,
      rotate: 111,
      ceiling: 110,
      death: 113,
      pause: 114,
      abort: 115
    });
  });

  test("retains the original MIDI as the music source", () => {
    expect(AUDIO_MANIFEST.music).toBe(`${import.meta.env.BASE_URL}assets/BGM.MID`);
    expect(MUSIC_MASTER_GAIN).toBe(0.1);
  });

  test("exposes each mapped event for manual preview", () => {
    expect(AUDIO_EFFECTS.map(({ event, resourceId, durationMs }) => ({
      event,
      resourceId,
      durationMs: Math.round(durationMs)
    }))).toEqual([
      { event: "land", resourceId: 107, durationMs: 272 },
      { event: "heal", resourceId: 108, durationMs: 320 },
      { event: "hurt", resourceId: 110, durationMs: 442 },
      { event: "spring", resourceId: 109, durationMs: 439 },
      { event: "conveyor", resourceId: 107, durationMs: 272 },
      { event: "rotate", resourceId: 111, durationMs: 1083 },
      { event: "ceiling", resourceId: 110, durationMs: 442 },
      { event: "death", resourceId: 113, durationMs: 1812 },
      { event: "pause", resourceId: 114, durationMs: 802 },
      { event: "abort", resourceId: 115, durationMs: 1380 }
    ]);
  });
});
