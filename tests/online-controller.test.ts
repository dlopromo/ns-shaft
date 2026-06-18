import { describe, expect, test } from "vitest";
import { OnlineGameController } from "../src/game/online/controller";
import type { InputFrame } from "../src/game/types";

const idle: InputFrame = {
  players: [{ left: false, right: false }, { left: false, right: false }],
  pausePressed: false
};

describe("OnlineGameController", () => {
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
          { left: false, right: false },
          { left: second.left, right: second.right }
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
          players: [idle.players[0], { left: tick % 5 === 0, right: tick % 5 === 3 }],
          pausePressed: false
        });
      }
      networkFrame += 1;
      if (networkFrame > 300) throw new Error("lockstep did not recover");
    }

    expect(host.snapshot()).toEqual(guest.snapshot());
  });
});
