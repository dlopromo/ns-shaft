import { GameSimulation } from "../simulation";
import type { Difficulty, GameStateSnapshot, InputFrame } from "../types";
import type { OnlineMechanismOptions } from "./session";
import {
  OnlineLockstepController,
  type LockstepStatus,
  type NetworkPlayerInput
} from "./lockstep";

const STEP_MS = 1000 / 60;

export interface OnlineControllerConfig {
  seed: number;
  difficulty: Difficulty;
  networkDelayTicks: number;
  playerId: 0 | 1;
  options?: OnlineMechanismOptions;
  sendInput: (tick: number, playerId: 0 | 1, input: NetworkPlayerInput) => Promise<void>;
}

export class OnlineGameController {
  private readonly game: GameSimulation;
  private readonly lockstep: OnlineLockstepController;
  private inputTick = 0;
  private simulationTick = 0;
  private currentStatus: { phase: "playing" | "waiting"; lockstep: LockstepStatus };

  constructor(private readonly config: OnlineControllerConfig) {
    this.game = new GameSimulation({
      seed: config.seed,
      difficulty: config.difficulty,
      players: 2
    });
    if (config.options) this.game.setOptions(config.options);
    this.lockstep = new OnlineLockstepController({
      networkDelayTicks: config.networkDelayTicks
    });
    this.currentStatus = {
      phase: "waiting",
      lockstep: this.lockstep.status()
    };
  }

  queueRemoteInput(tick: number, playerId: 0 | 1, input: NetworkPlayerInput): void {
    this.lockstep.bufferInput(tick, playerId, input);
  }

  step(localInput: InputFrame): void {
    const input = {
      ...localInput.players[this.config.playerId],
      pausePressed: localInput.pausePressed
    };
    const outgoingTick = this.inputTick;
    this.lockstep.bufferInput(outgoingTick, this.config.playerId, input);
    void this.config.sendInput(outgoingTick, this.config.playerId, input);
    this.inputTick += 1;

    if (this.inputTick <= this.config.networkDelayTicks) {
      this.currentStatus = {
        phase: "waiting",
        lockstep: this.lockstep.status()
      };
      return;
    }

    const simulationInput = this.lockstep.nextInputForSimulation(
      this.simulationTick + this.config.networkDelayTicks
    );
    if (!simulationInput) {
      this.currentStatus = {
        phase: "waiting",
        lockstep: this.lockstep.status()
      };
      return;
    }

    this.game.step(simulationInput, STEP_MS);
    this.simulationTick += 1;
    this.currentStatus = {
      phase: "playing",
      lockstep: this.lockstep.status()
    };
  }

  snapshot(): GameStateSnapshot {
    return this.game.snapshot();
  }

  drainEvents(): ReturnType<GameSimulation["drainEvents"]> {
    return this.game.drainEvents();
  }

  status(): { phase: "playing" | "waiting"; lockstep: LockstepStatus } {
    return {
      phase: this.currentStatus.phase,
      lockstep: {
        ...this.currentStatus.lockstep,
        missingPlayers: [...this.currentStatus.lockstep.missingPlayers]
      }
    };
  }
}
