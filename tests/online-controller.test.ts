import { describe, expect, test } from "vitest";
import { OnlineGameController } from "../src/game/online/controller";
import type { InputBatch } from "../src/game/online/sync";
import type { InputFrame } from "../src/game/types";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("OnlineGameController", () => {
  test("publishes ordered three-frame input batches from local arrow input", () => {
    const sent: InputBatch[] = [];
    const controller = new OnlineGameController({
      seed: 2026,
      difficulty: "normal",
      round: 2,
      bufferTicks: 6,
      playerId: 1,
      sendInputBatch: async (batch) => { sent.push(batch); }
    });

    controller.step({ players: [{ left: true, right: false }, idle.players[1]], pausePressed: false });
    controller.step(idle);
    controller.step({ players: [{ left: false, right: true }, idle.players[1]], pausePressed: false });

    expect(sent).toEqual([{
      round: 2,
      playerId: 1,
      sequence: 0,
      startTick: 0,
      frames: [
        { left: true, right: false },
        { left: false, right: false },
        { left: false, right: true }
      ]
    }]);
  });

  test("waits on a missing remote batch then recovers without skipping simulation ticks", () => {
    const hostBatches: InputBatch[] = [];
    const guestBatches: InputBatch[] = [];
    const host = new OnlineGameController({
      seed: 900,
      difficulty: "hard",
      round: 1,
      bufferTicks: 6,
      playerId: 0,
      sendInputBatch: async (batch) => { hostBatches.push(batch); }
    });
    const guest = new OnlineGameController({
      seed: 900,
      difficulty: "hard",
      round: 1,
      bufferTicks: 6,
      playerId: 1,
      sendInputBatch: async (batch) => { guestBatches.push(batch); }
    });

    for (let tick = 0; tick < 12; tick += 1) {
      host.step(idle);
      guest.step(idle);
    }
    host.queueRemoteBatch(guestBatches[0]);
    guest.queueRemoteBatch(hostBatches[0]);
    expect(host.snapshot().ticks).toBe(0);
    expect(guest.snapshot().ticks).toBe(0);

    host.queueRemoteBatch(guestBatches[1]);
    guest.queueRemoteBatch(hostBatches[1]);
    for (let tick = 0; tick < 6; tick += 1) {
      host.step(idle);
      guest.step(idle);
    }
    expect(host.snapshot().ticks).toBeGreaterThan(0);
    expect(host.snapshot()).toEqual(guest.snapshot());
  });

  test("applies a host checkpoint and continues deterministically", () => {
    const guestBatches: InputBatch[] = [];
    const host = new OnlineGameController({
      seed: 901,
      difficulty: "normal",
      round: 3,
      bufferTicks: 6,
      playerId: 0,
      sendInputBatch: async () => undefined
    });
    const guest = new OnlineGameController({
      seed: 2,
      difficulty: "easy",
      round: 3,
      bufferTicks: 6,
      playerId: 1,
      sendInputBatch: async (batch) => { guestBatches.push(batch); }
    });

    guest.applyHostCheckpoint(host.checkpoint());
    expect(guest.snapshot()).toEqual(host.snapshot());
    expect(guest.syncStatus().stateHash).toBe(host.syncStatus().stateHash);
    guest.receivePeerStatus({
      simulationTick: 0,
      confirmedInputTick: -1,
      missingSequence: null,
      stateHash: host.syncStatus().stateHash,
      connected: true,
      updatedAt: 1000
    });
    expect(guest.syncStatus().peerStateMatch).toBe(true);
    for (let tick = 0; tick < 3; tick += 1) guest.step(idle);
    expect(guestBatches[0].startTick).toBeGreaterThanOrEqual(6);
  });

  test("publishes periodic sync status and host checkpoints", () => {
    const statuses: unknown[] = [];
    const checkpoints: unknown[] = [];
    const controller = new OnlineGameController({
      seed: 902,
      difficulty: "normal",
      round: 5,
      bufferTicks: 6,
      playerId: 0,
      sendInputBatch: async () => undefined,
      publishSyncStatus: async (status) => { statuses.push(status); },
      publishCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint); }
    });

    for (let tick = 0; tick < 90; tick += 1) {
      controller.queueRemoteInput(tick, 1, { left: false, right: false, pausePressed: false });
      controller.step(idle);
    }

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.at(-1)).toMatchObject({ simulationTick: 60, connected: true });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({ round: 5, tick: 60 });
  });

  test("resends a retained batch requested by the peer status", () => {
    const sent: InputBatch[] = [];
    const controller = new OnlineGameController({
      seed: 903,
      difficulty: "normal",
      round: 6,
      bufferTicks: 6,
      playerId: 0,
      sendInputBatch: async (batch) => { sent.push(batch); }
    });
    for (let tick = 0; tick < 3; tick += 1) controller.step(idle);
    expect(sent).toHaveLength(1);

    controller.receivePeerStatus({
      simulationTick: 0,
      confirmedInputTick: -1,
      missingSequence: 0,
      stateHash: "",
      connected: true,
      updatedAt: 1000
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
  });

  test("prunes a local batch after the peer confirms consuming it", () => {
    const removed: number[] = [];
    const controller = new OnlineGameController({
      seed: 905,
      difficulty: "normal",
      round: 8,
      bufferTicks: 6,
      playerId: 0,
      sendInputBatch: async () => undefined,
      removeInputBatch: async (sequence) => { removed.push(sequence); }
    });
    for (let tick = 0; tick < 3; tick += 1) controller.step(idle);

    controller.receivePeerStatus({
      simulationTick: 3,
      confirmedInputTick: 2,
      missingSequence: null,
      stateHash: "",
      connected: true,
      updatedAt: 1000
    });

    expect(removed).toEqual([0]);
    expect(controller.resendBatch(0)).toBe(false);
  });

  test("retries a failed input batch write without changing its sequence", async () => {
    const attempts: InputBatch[] = [];
    let releaseRetry: (() => void) | undefined;
    const controller = new OnlineGameController({
      seed: 904,
      difficulty: "normal",
      round: 7,
      bufferTicks: 6,
      playerId: 0,
      retryDelayMs: 0,
      sendInputBatch: async (batch) => {
        attempts.push(batch);
        if (attempts.length === 1) throw new Error("temporary write failure");
        releaseRetry?.();
      }
    });
    const retried = new Promise<void>((resolve) => { releaseRetry = resolve; });

    for (let tick = 0; tick < 3; tick += 1) controller.step(idle);
    await retried;

    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
  });

  test("does not advance until delayed lockstep input is complete", () => {
    const sent: unknown[] = [];
    const controller = new OnlineGameController({
      seed: 123,
      difficulty: "normal",
      networkDelayTicks: 1,
      playerId: 0,
      sendInput: async (tick, playerId, input) => {
        sent.push({ tick, playerId, input });
      }
    });

    controller.queueRemoteInput(0, 0, { left: false, right: true, pausePressed: false });
    controller.step(idle);
    expect(controller.snapshot().ticks).toBe(0);
    expect(controller.status().phase).toBe("waiting");

    controller.queueRemoteInput(0, 1, { left: true, right: false, pausePressed: false });
    controller.step(idle);
    expect(controller.snapshot().ticks).toBeGreaterThan(0);
    expect(controller.status().phase).toBe("playing");
    expect(sent).toHaveLength(2);
  });

  test("retries the same simulation tick when remote input arrives late", () => {
    const controller = new OnlineGameController({
      seed: 321,
      difficulty: "normal",
      networkDelayTicks: 1,
      playerId: 0,
      sendInput: async () => undefined
    });

    controller.step(idle);
    controller.step(idle);
    controller.step(idle);
    expect(controller.snapshot().ticks).toBe(0);

    controller.queueRemoteInput(0, 1, {
      left: false,
      right: false,
      pausePressed: false
    });
    controller.step(idle);

    expect(controller.snapshot().ticks).toBe(1);
    expect(controller.status().phase).toBe("playing");
  });

  test("two controllers with the same input log stay deterministic", () => {
    const host = new OnlineGameController({
      seed: 555,
      difficulty: "hard",
      networkDelayTicks: 0,
      playerId: 0,
      sendInput: async () => undefined
    });
    const guest = new OnlineGameController({
      seed: 555,
      difficulty: "hard",
      networkDelayTicks: 0,
      playerId: 1,
      sendInput: async () => undefined
    });

    for (let tick = 0; tick < 30; tick += 1) {
      const first = { left: tick % 2 === 0, right: false, pausePressed: false };
      const second = { left: false, right: tick % 3 === 0, pausePressed: false };
      host.queueRemoteInput(tick, 1, second);
      guest.queueRemoteInput(tick, 0, first);
      host.step({
        players: [
          { left: first.left, right: first.right },
          { left: false, right: false }
        ],
        pausePressed: first.pausePressed
      });
      guest.step({
        players: [
          { left: second.left, right: second.right },
          { left: false, right: false }
        ],
        pausePressed: second.pausePressed
      });
    }

    expect(host.snapshot()).toEqual(guest.snapshot());
  });

  test("stays deterministic after asymmetric packet delays", () => {
    let networkFrame = 0;
    let hostInputTick = 0;
    let guestInputTick = 0;
    const toHost: Array<{ at: number; tick: number; input: {
      left: boolean; right: boolean; pausePressed: boolean;
    } }> = [];
    const toGuest: typeof toHost = [];
    const host = new OnlineGameController({
      seed: 777,
      difficulty: "hard",
      networkDelayTicks: 2,
      playerId: 0,
      sendInput: async (tick, _playerId, input) => {
        toGuest.push({ at: networkFrame + 3, tick, input });
      }
    });
    const guest = new OnlineGameController({
      seed: 777,
      difficulty: "hard",
      networkDelayTicks: 2,
      playerId: 1,
      sendInput: async (tick, _playerId, input) => {
        toHost.push({ at: networkFrame + 1, tick, input });
      }
    });

    while (host.snapshot().ticks < 30 || guest.snapshot().ticks < 30) {
      for (const packet of toHost.splice(0).filter((packet) => {
        if (packet.at > networkFrame) return true;
        host.queueRemoteInput(packet.tick, 1, packet.input);
        return false;
      })) toHost.push(packet);
      for (const packet of toGuest.splice(0).filter((packet) => {
        if (packet.at > networkFrame) return true;
        guest.queueRemoteInput(packet.tick, 0, packet.input);
        return false;
      })) toGuest.push(packet);

      if (host.snapshot().ticks < 30) {
        const tick = hostInputTick++;
        host.step({
          players: [{ left: tick % 4 === 0, right: tick % 4 === 2 }, idle.players[1]],
          pausePressed: false
        });
      }
      if (guest.snapshot().ticks < 30) {
        const tick = guestInputTick++;
        guest.step({
          players: [{ left: tick % 5 === 0, right: tick % 5 === 3 }, idle.players[1]],
          pausePressed: false
        });
      }
      networkFrame += 1;
      if (networkFrame > 300) throw new Error("lockstep did not recover");
    }

    expect(host.snapshot()).toEqual(guest.snapshot());
  });

  test("maps arrow-key input to the guest network slot", () => {
    const sent: unknown[] = [];
    const guest = new OnlineGameController({
      seed: 888,
      difficulty: "normal",
      networkDelayTicks: 1,
      playerId: 1,
      sendInput: async (tick, playerId, input) => { sent.push({ tick, playerId, input }); }
    });

    guest.step({
      players: [{ left: true, right: false }, { left: false, right: false }],
      pausePressed: false
    });

    expect(sent[0]).toMatchObject({
      playerId: 1,
      input: { left: true, right: false }
    });
  });
});
