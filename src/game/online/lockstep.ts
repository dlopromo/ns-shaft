import type { InputFrame, PlayerInput } from "../types";

export interface NetworkPlayerInput extends PlayerInput {
  pausePressed: boolean;
}

export interface LockstepStatus {
  phase: "ready" | "waiting";
  waitingForTick: number | null;
  missingPlayers: number[];
}

export class OnlineLockstepController {
  private inputs = new Map<number, Partial<Record<0 | 1, NetworkPlayerInput>>>();
  private minimumTick = 0;
  private currentStatus: LockstepStatus = {
    phase: "ready",
    waitingForTick: null,
    missingPlayers: []
  };

  constructor(private readonly options: { networkDelayTicks: number }) {}

  bufferInput(tick: number, playerId: 0 | 1, input: NetworkPlayerInput): void {
    if (tick < this.minimumTick) return;
    const frame = this.inputs.get(tick) ?? {};
    frame[playerId] = { ...input };
    this.inputs.set(tick, frame);
  }

  nextInputForSimulation(localTick: number): InputFrame | null {
    const targetTick = localTick - this.options.networkDelayTicks;
    if (targetTick < 0) {
      this.currentStatus = {
        phase: "waiting",
        waitingForTick: targetTick,
        missingPlayers: [0, 1]
      };
      return null;
    }

    const frame = this.inputs.get(targetTick);
    const missingPlayers = ([0, 1] as const).filter((playerId) => !frame?.[playerId]);
    if (missingPlayers.length > 0) {
      this.currentStatus = {
        phase: "waiting",
        waitingForTick: targetTick,
        missingPlayers
      };
      return null;
    }

    this.currentStatus = {
      phase: "ready",
      waitingForTick: null,
      missingPlayers: []
    };
    return {
      players: [
        { left: frame![0]!.left, right: frame![0]!.right },
        { left: frame![1]!.left, right: frame![1]!.right }
      ],
      pausePressed: Boolean(frame![0]!.pausePressed || frame![1]!.pausePressed)
    };
  }

  status(): LockstepStatus {
    return { ...this.currentStatus, missingPlayers: [...this.currentStatus.missingPlayers] };
  }

  discardBefore(tick: number): void {
    this.minimumTick = Math.max(this.minimumTick, tick);
    for (const inputTick of this.inputs.keys()) {
      if (inputTick < tick) this.inputs.delete(inputTick);
    }
  }
}
