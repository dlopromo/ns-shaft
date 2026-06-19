import { describe, expect, test } from "vitest";
import { parseResumeTicket } from "../src/game/online/resume";

describe("online resume ticket", () => {
  test("accepts only a complete four-digit room ticket", () => {
    expect(parseResumeTicket(JSON.stringify({
      roomCode: "0429", playerId: 1, playerName: "PLAYER2"
    }))).toEqual({ roomCode: "0429", playerId: 1, playerName: "PLAYER2" });
    expect(parseResumeTicket("not-json")).toBeNull();
    expect(parseResumeTicket(JSON.stringify({ roomCode: "429", playerId: 1 }))).toBeNull();
  });
});
