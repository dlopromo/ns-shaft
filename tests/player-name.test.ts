import { describe, expect, test } from "vitest";
import { normalizePlayerName } from "../src/game/player-name";

describe("player name normalization", () => {
  test("keeps at most eight uppercase ASCII letters and digits", () => {
    expect(normalizePlayerName("ab-c 12_日本語3456", "PLAYER1")).toBe("ABC12345");
    expect(normalizePlayerName("", "PLAYER2")).toBe("PLAYER2");
    expect(normalizePlayerName("player999", "PLAYER1")).toBe("PLAYER99");
  });
});
