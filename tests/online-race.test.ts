import { describe, expect, test } from "vitest";
import { OnlineRaceController, serializeRaceSnapshot } from "../src/game/online/race";
import type { InputFrame } from "../src/game/types";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("OnlineRaceController", () => {
  test("advances the local one-player game without a remote snapshot", () => {
    const sent: unknown[] = [];
    const controller = new OnlineRaceController({
      seed: 123,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 6,
      now: () => 1000,
      sendSnapshot: async (snapshot) => {
        sent.push(snapshot);
      }
    });

    controller.step(idle);

    expect(controller.localSnapshot().ticks).toBeGreaterThan(0);
    expect(controller.localSnapshot().players).toHaveLength(1);
    expect(controller.remoteSnapshot()).toBeNull();
    expect(controller.status().remoteWaiting).toBe(true);
  });

  test("publishes every configured interval and accepts opponent snapshots", () => {
    const sent: unknown[] = [];
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 555,
      difficulty: "hard",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 2,
      now: () => now,
      sendSnapshot: async (snapshot) => {
        sent.push(snapshot);
      }
    });
    const opponent = new OnlineRaceController({
      seed: 555,
      difficulty: "hard",
      playerId: 1,
      playerName: "GUEST",
      snapshotIntervalTicks: 2,
      now: () => now,
      sendSnapshot: async () => undefined
    });

    opponent.step(idle);
    const remote = serializeRaceSnapshot(1, "GUEST", now, opponent.localSnapshot());
    controller.receiveSnapshot(remote);
    controller.step(idle);
    controller.step(idle);

    expect(sent).toHaveLength(1);
    expect(controller.remoteSnapshot()).toEqual(remote.state);
    expect(controller.status()).toMatchObject({
      remoteWaiting: false,
      localFinished: false,
      remoteFinished: false
    });

    now = 2601;
    expect(controller.status().remoteWaiting).toBe(true);
  });

  test("serializes a detached JSON-safe race snapshot", () => {
    const controller = new OnlineRaceController({
      seed: 77,
      difficulty: "easy",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 6,
      now: () => 1000,
      sendSnapshot: async () => undefined
    });

    const snapshot = serializeRaceSnapshot(0, "HOST", 1000, controller.localSnapshot());
    const encoded = JSON.stringify(snapshot);

    expect(JSON.parse(encoded)).toEqual(snapshot);
    expect(snapshot.state).not.toBe(controller.localSnapshot());
  });

  test("publishes a pause transition once without repeating the frozen tick", () => {
    const sent: unknown[] = [];
    const controller = new OnlineRaceController({
      seed: 91,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 1,
      now: () => 1000,
      sendSnapshot: async (snapshot) => {
        sent.push(snapshot);
      }
    });

    controller.step(idle);
    controller.step({ ...idle, pausePressed: true });
    controller.step(idle);

    expect(sent).toHaveLength(2);
    expect((sent[1] as { state: { mode: string } }).state.mode).toBe("paused");
  });

  test("interpolates remote render state without changing authoritative results", () => {
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 92,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 6,
      now: () => now,
      sendSnapshot: async () => undefined
    });
    const base = controller.localSnapshot();
    const first = serializeRaceSnapshot(1, "GUEST", 1000, {
      ...base,
      ticks: 6,
      cameraY: 10,
      players: base.players.map((player) => ({
        ...player, x: 100, y: 200, facing: "left" as const
      })),
      platforms: base.platforms.map((platform) => ({ ...platform, y: 100 }))
    });
    controller.receiveSnapshot(first);

    now = 1100;
    const second = serializeRaceSnapshot(1, "GUEST", 1100, {
      ...base,
      ticks: 12,
      cameraY: 30,
      players: base.players.map((player) => ({
        ...player, x: 200, y: 300, facing: "right" as const
      })),
      platforms: base.platforms.map((platform) => ({ ...platform, y: 120 }))
    });
    controller.receiveSnapshot(second);

    now = 1150;
    expect(controller.remoteSnapshot()?.players[0]).toMatchObject({
      x: 200,
      y: 300,
      facing: "right"
    });
    expect(controller.remoteRenderSnapshot()?.players[0]).toMatchObject({
      x: 150,
      y: 250,
      facing: "right"
    });
    expect(controller.remoteRenderSnapshot()?.cameraY).toBe(20);
    expect(controller.remoteRenderSnapshot()?.platforms[0].y).toBe(110);
  });

  test("ignores an older remote snapshot", () => {
    const controller = new OnlineRaceController({
      seed: 93,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 6,
      now: () => 1000,
      sendSnapshot: async () => undefined
    });
    const state = controller.localSnapshot();
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", 2000, {
      ...state,
      ticks: 20,
      players: state.players.map((player) => ({ ...player, x: 200 }))
    }));
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", 1000, {
      ...state,
      ticks: 10,
      players: state.players.map((player) => ({ ...player, x: 100 }))
    }));

    expect(controller.remoteSnapshot()?.players[0].x).toBe(200);
  });
});
