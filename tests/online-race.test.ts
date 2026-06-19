import { describe, expect, test } from "vitest";
import {
  OnlineRaceController,
  serializeRaceSnapshot,
  type RaceSnapshot
} from "../src/game/online/race";
import type { InputFrame } from "../src/game/types";
import { OnlineConnectionMonitor } from "../src/game/online/connection";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("OnlineRaceController", () => {
  test("publishes a heartbeat every second after local gameplay stops", async () => {
    let now = 0;
    const sent: RaceSnapshot[] = [];
    const controller = new OnlineRaceController({
      seed: 1,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      snapshotIntervalTicks: 6,
      now: () => now,
      sendSnapshot: async (snapshot) => { sent.push(snapshot); }
    });
    controller.beginPlaying();
    await Promise.resolve();
    const initialCount = sent.length;

    now = 999;
    controller.heartbeat();
    await Promise.resolve();
    expect(sent).toHaveLength(initialCount);
    now = 1000;
    controller.heartbeat();
    await Promise.resolve();
    expect(sent).toHaveLength(initialCount + 1);
    now = 2000;
    controller.heartbeat();
    await Promise.resolve();
    expect(sent).toHaveLength(initialCount + 2);
  });

  test("keeps connection health active for thirty seconds of heartbeat snapshots", () => {
    let now = 0;
    const monitor = new OnlineConnectionMonitor(now);
    const controller = new OnlineRaceController({
      seed: 1, difficulty: "normal", playerId: 0, playerName: "HOST",
      snapshotIntervalTicks: 6, now: () => now,
      sendSnapshot: async () => { monitor.markPeerActivity(now); }
    });
    controller.beginPlaying();
    for (now = 1000; now <= 30000; now += 1000) {
      controller.heartbeat();
      expect(monitor.state(now)).toBe("healthy");
    }
  });

  test("reports whether an opponent snapshot was accepted", () => {
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 1, difficulty: "normal", playerId: 0, playerName: "HOST", round: 2,
      snapshotIntervalTicks: 6, now: () => now, sendSnapshot: async () => undefined
    });
    const state = controller.localSnapshot();
    const valid = serializeRaceSnapshot(1, "GUEST", now, state, 2, 4);
    expect(controller.receiveSnapshot(valid)).toBe(true);
    expect(controller.receiveSnapshot(valid)).toBe(false);
    expect(controller.receiveSnapshot({ ...valid, playerId: 0, sequence: 5 })).toBe(false);
    expect(controller.receiveSnapshot({ ...valid, round: 3, sequence: 6 })).toBe(false);
  });
  test("does not age the remote connection during the five second countdown", () => {
    const sent: unknown[] = [];
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 123,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      round: 3,
      snapshotIntervalTicks: 6,
      now: () => now,
      sendSnapshot: async (snapshot) => { sent.push(snapshot); }
    });

    now = 7000;
    controller.beginPlaying();
    expect(controller.status()).toMatchObject({ remoteAgeMs: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ playerId: 0, round: 3, sequence: 0 });
  });

  test("advances the local one-player game without a remote snapshot", () => {
    const sent: unknown[] = [];
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 123,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      round: 1,
      snapshotIntervalTicks: 6,
      now: () => now,
      sendSnapshot: async (snapshot) => {
        sent.push(snapshot);
      }
    });

    controller.step(idle);

    expect(controller.localSnapshot().ticks).toBeGreaterThan(0);
    expect(controller.localSnapshot().players).toHaveLength(1);
    expect(controller.remoteSnapshot()).toBeNull();
    expect(controller.status()).toMatchObject({ remoteAgeMs: 0 });
    now = 6000;
    expect(controller.status()).toMatchObject({ remoteAgeMs: 5000 });
  });

  test("publishes every configured interval and accepts opponent snapshots", () => {
    const sent: unknown[] = [];
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 555,
      difficulty: "hard",
      playerId: 0,
      playerName: "HOST",
      round: 1,
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
      round: 1,
      snapshotIntervalTicks: 2,
      now: () => now,
      sendSnapshot: async () => undefined
    });

    opponent.step(idle);
    const remote = serializeRaceSnapshot(1, "GUEST", now, opponent.localSnapshot(), 1, 0);
    controller.receiveSnapshot(remote);
    controller.step(idle);
    controller.step(idle);

    expect(sent).toHaveLength(2);
    expect(controller.remoteSnapshot()).toEqual(remote.state);
    expect(controller.status()).toMatchObject({
      localFinished: false,
      remoteFinished: false
    });

    now = 6000;
    expect(controller.status().remoteAgeMs).toBe(5000);
  });

  test("serializes a detached JSON-safe race snapshot", () => {
    const controller = new OnlineRaceController({
      seed: 77,
      difficulty: "easy",
      playerId: 0,
      playerName: "HOST",
      round: 1,
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
      round: 1,
      snapshotIntervalTicks: 1,
      now: () => 1000,
      sendSnapshot: async (snapshot) => {
        sent.push(snapshot);
      }
    });

    controller.step(idle);
    controller.step({ ...idle, pausePressed: true });
    controller.step(idle);

    expect(sent).toHaveLength(3);
    expect((sent[2] as { state: { mode: string } }).state.mode).toBe("paused");
  });

  test("interpolates remote render state without changing authoritative results", () => {
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 92,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      round: 1,
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
    }, 1, 1);
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
    }, 1, 2);
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

  test("adapts remote render delay to packet jitter within a bounded window", () => {
    let now = 1000;
    const controller = new OnlineRaceController({
      seed: 95,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      round: 1,
      snapshotIntervalTicks: 6,
      now: () => now,
      sendSnapshot: async () => undefined
    });
    const state = controller.localSnapshot();

    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", now, state, 1, 1));
    now += 100;
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", now, state, 1, 2));
    expect(controller.status().renderDelayMs).toBe(100);

    now += 240;
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", now, state, 1, 3));
    expect(controller.status().renderDelayMs).toBeGreaterThan(100);
    expect(controller.status().renderDelayMs).toBeLessThanOrEqual(250);
  });

  test("ignores an older remote snapshot", () => {
    const controller = new OnlineRaceController({
      seed: 93,
      difficulty: "normal",
      playerId: 0,
      playerName: "HOST",
      round: 4,
      snapshotIntervalTicks: 6,
      now: () => 1000,
      sendSnapshot: async () => undefined
    });
    const state = controller.localSnapshot();
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", 2000, {
      ...state,
      ticks: 20,
      players: state.players.map((player) => ({ ...player, x: 200 }))
    }, 4, 2));
    controller.receiveSnapshot(serializeRaceSnapshot(1, "GUEST", 1000, {
      ...state,
      ticks: 10,
      players: state.players.map((player) => ({ ...player, x: 100 }))
    }, 4, 1));

    expect(controller.remoteSnapshot()?.players[0].x).toBe(200);
  });

  test("accepts only the current round opponent with a newer sequence", () => {
    const controller = new OnlineRaceController({
      seed: 94,
      difficulty: "normal",
      playerId: 1,
      playerName: "GUEST",
      round: 7,
      snapshotIntervalTicks: 6,
      now: () => 1000,
      sendSnapshot: async () => undefined
    });
    const state = controller.localSnapshot();

    controller.receiveSnapshot(serializeRaceSnapshot(1, "SELF", 1000, state, 7, 1));
    controller.receiveSnapshot(serializeRaceSnapshot(0, "OLDROUND", 1000, state, 6, 2));
    expect(controller.remoteSnapshot()).toBeNull();

    controller.receiveSnapshot(serializeRaceSnapshot(0, "HOST", 1000, state, 7, 2));
    controller.receiveSnapshot(serializeRaceSnapshot(0, "STALE", 2000, {
      ...state,
      players: state.players.map((player) => ({ ...player, x: 10 }))
    }, 7, 1));
    expect(controller.remoteIdentity()).toEqual({ playerId: 0, name: "HOST" });
    expect(controller.remoteSnapshot()?.players[0].x).not.toBe(10);
  });
});
