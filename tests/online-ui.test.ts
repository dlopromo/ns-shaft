import { describe, expect, test } from "vitest";
import { copyRoomCode } from "../src/game/online/clipboard";
import { buildLobbyView } from "../src/game/online/lobby";

describe("online room UI helpers", () => {
  test("reports copied, blocked, and unavailable clipboard outcomes", async () => {
    const written: string[] = [];
    expect(await copyRoomCode("123456", {
      writeText: async (value) => { written.push(value); }
    })).toBe("copied");
    expect(written).toEqual(["123456"]);

    expect(await copyRoomCode("123456", {
      writeText: async () => { throw new Error("denied"); }
    })).toBe("blocked");
    expect(await copyRoomCode("123456", undefined)).toBe("unavailable");
  });

  test("builds visible P1/P2 badges and local ready button state", () => {
    const view = buildLobbyView({
      players: {
        0: { connected: true, ready: true, name: "HOST" },
        1: { connected: true, ready: false, name: "GUEST" }
      }
    }, 1);

    expect(view.players).toEqual([
      { playerId: 0, label: "P1 HOST", name: "HOST", status: "ready", text: "READY" },
      { playerId: 1, label: "P2 GUEST", name: "GUEST", status: "connected", text: "CONNECTED" }
    ]);
    expect(view.readyButton).toEqual({
      state: "available",
      label: "Ready",
      disabled: false
    });
  });

  test("marks a local ready player and leaves an empty slot waiting", () => {
    const view = buildLobbyView({
      players: {
        0: { connected: true, ready: true, name: "HOST" }
      }
    }, 0);

    expect(view.players[1]).toMatchObject({ status: "waiting", text: "WAITING" });
    expect(view.readyButton).toEqual({
      state: "ready",
      label: "READY ✓",
      disabled: true
    });
  });
});
