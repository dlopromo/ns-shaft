import { describe, expect, test } from "vitest";
import { copyRoomCode } from "../src/game/online/clipboard";
import { buildLobbyView } from "../src/game/online/lobby";

describe("online room UI helpers", () => {
  test("reports copied, blocked, and unavailable clipboard outcomes", async () => {
    const written: string[] = [];
    expect(await copyRoomCode("1234", {
      writeText: async (value) => { written.push(value); }
    })).toBe("copied");
    expect(written).toEqual(["1234"]);

    expect(await copyRoomCode("1234", {
      writeText: async () => { throw new Error("denied"); }
    })).toBe("blocked");
    expect(await copyRoomCode("1234", undefined)).toBe("unavailable");
  });

  test("builds visible P1/P2 badges and local ready button state", () => {
    const view = buildLobbyView({
      players: {
        0: { connected: true, ready: true, name: "HOST" },
        1: { connected: true, ready: false, name: "GUEST" }
      }
    }, 1);

    expect(view.players).toEqual([
      { playerId: 0, label: "1P ホスト", name: "HOST", status: "ready", text: "準備完了" },
      { playerId: 1, label: "2P ゲスト", name: "GUEST", status: "connected", text: "接続済み" }
    ]);
    expect(view.readyButton).toEqual({
      state: "available",
      label: "準備完了",
      disabled: false
    });
  });

  test("marks a local ready player and leaves an empty slot waiting", () => {
    const view = buildLobbyView({
      players: {
        0: { connected: true, ready: true, name: "HOST" }
      }
    }, 0);

    expect(view.players[1]).toMatchObject({ status: "waiting", text: "待機中" });
    expect(view.readyButton).toEqual({
      state: "ready",
      label: "準備完了 ✓",
      disabled: true
    });
  });
});
