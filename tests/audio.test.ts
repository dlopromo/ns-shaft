import { describe, expect, test } from "vitest";
import { AUDIO_MANIFEST } from "../src/game/audio";

describe("original audio manifest", () => {
  test("maps all nine WAVE resources to game events", () => {
    expect(Object.keys(AUDIO_MANIFEST.effects)).toHaveLength(9);
    expect(new Set(Object.values(AUDIO_MANIFEST.effects))).toHaveLength(9);
  });

  test("retains the original MIDI as the music source", () => {
    expect(AUDIO_MANIFEST.music).toBe("/assets/BGM.MID");
  });
});
