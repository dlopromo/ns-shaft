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
      {
        playerId: 0,
        role: "host",
        label: "1P ホスト",
        name: "HOST",
        status: "ready",
        text: "準備完了",
        spriteVariant: "yellow",
        isLocalPlayer: false
      },
      {
        playerId: 1,
        role: "guest",
        label: "2P ゲスト",
        name: "GUEST",
        status: "connected",
        text: "接続済み",
        spriteVariant: "green",
        isLocalPlayer: true
      }
    ]);
    expect(view.readyButton).toEqual({
      state: "available",
      label: "準備完了",
      disabled: false
    });
    expect(view.startButton).toEqual({ disabled: true });
    expect(view.header).toEqual({
      roomCode: "----",
      playerCount: "2/2",
      readyState: "WAITING"
    });
    expect(view.actions).toEqual({
      showCopy: false,
      showReady: true,
      showStart: true,
      showSettings: true,
      showCodeInput: false,
      showCreate: false,
      showJoin: false
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
    expect(view.startButton).toEqual({ disabled: true });
    expect(view.players[0]).toMatchObject({ isLocalPlayer: true, spriteVariant: "yellow" });
  });

  test("lets only an unready host edit synchronized room settings", () => {
    const room = {
      meta: {
        difficulty: "hard" as const,
        mode: "race" as const,
        options: { conveyor: true, spring: false, rotating: true, fast: false }
      },
      players: {
        0: { connected: true, ready: false, name: "HOST" },
        1: { connected: true, ready: false, name: "GUEST" }
      }
    };

    expect(buildLobbyView(room, 0).settings).toEqual({
      difficulty: "hard",
      mode: "race",
      options: { conveyor: true, spring: false, rotating: true, fast: false },
      editable: true,
      locked: false
    });
    expect(buildLobbyView(room, 1).settings).toMatchObject({ editable: false, locked: false });
  });

  test("locks shared room settings as soon as either player is ready", () => {
    const view = buildLobbyView({
      meta: {
        difficulty: "normal",
        mode: "coop",
        options: { conveyor: true, spring: true, rotating: true, fast: false }
      },
      players: {
        0: { connected: true, ready: false, name: "HOST" },
        1: { connected: true, ready: true, name: "GUEST" }
      }
    }, 0);

    expect(view.settings).toMatchObject({ editable: false, locked: true });
  });

  test("shows host-only copy action and role-fixed player identities", () => {
    const view = buildLobbyView({
      meta: {
        mode: "race",
        difficulty: "hard",
        options: { conveyor: true, spring: true, rotating: false, fast: true }
      },
      players: {
        0: { connected: true, ready: false, name: "HOST" },
        1: { connected: false, ready: false, name: "---" }
      }
    }, 0);

    expect(view.header).toEqual({
      roomCode: "----",
      playerCount: "1/2",
      readyState: "WAITING"
    });
    expect(view.players).toMatchObject([
      { role: "host", spriteVariant: "yellow", isLocalPlayer: true },
      { role: "guest", spriteVariant: "green", isLocalPlayer: false }
    ]);
    expect(view.actions).toEqual({
      showCopy: true,
      showReady: true,
      showStart: false,
      showSettings: true,
      showCodeInput: false,
      showCreate: false,
      showJoin: false
    });
  });

  test("enables START only for the host after both players are ready", () => {
    const room = {
      players: {
        0: { connected: true, ready: true, name: "HOST" },
        1: { connected: true, ready: true, name: "GUEST" }
      }
    };

    expect(buildLobbyView(room, 0)).toMatchObject({
      actions: { showCopy: false, showStart: true },
      startButton: { disabled: false }
    });
    expect(buildLobbyView(room, 1)).toMatchObject({
      actions: { showCopy: false, showStart: true },
      startButton: { disabled: true }
    });
  });
});
