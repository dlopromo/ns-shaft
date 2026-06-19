import { GameSimulation } from "../simulation";
import type { Difficulty, GameStateSnapshot, InputFrame } from "../types";
import type { OnlineMechanismOptions } from "./session";
import {
  InputBatchAssembler,
  checkpointHash,
  type InputBatch,
  type OnlineCheckpoint,
  type OnlineSyncStatus
} from "./sync";
import {
  OnlineLockstepController,
  type LockstepStatus,
  type NetworkPlayerInput
} from "./lockstep";

const STEP_MS = 1000 / 60;

export interface OnlineControllerConfig {
  seed: number;
  difficulty: Difficulty;
  networkDelayTicks?: number;
  round?: number;
  bufferTicks?: number;
  retryDelayMs?: number;
  playerId: 0 | 1;
  options?: OnlineMechanismOptions;
  sendInput?: (tick: number, playerId: 0 | 1, input: NetworkPlayerInput) => Promise<void>;
  sendInputBatch?: (batch: InputBatch) => Promise<void>;
  removeInputBatch?: (sequence: number) => Promise<void>;
  publishSyncStatus?: (status: OnlineSyncStatus) => Promise<void>;
  publishCheckpoint?: (checkpoint: OnlineCheckpoint) => Promise<void>;
}

export class OnlineGameController {
  private readonly game: GameSimulation;
  private readonly lockstep: OnlineLockstepController;
  private inputTick = 0;
  private simulationTick = 0;
  private readonly batchAssembler?: InputBatchAssembler;
  private readonly batchMode: boolean;
  private readonly retainedBatches = new Map<number, InputBatch>();
  private readonly recentStateHashes = new Map<number, string>();
  private latestPeerStatus: OnlineSyncStatus | null = null;
  private peerStateMatch: boolean | null = null;
  private lastPublishedMissingSequence: number | null | undefined;
  private currentStatus: { phase: "playing" | "waiting"; lockstep: LockstepStatus };

  constructor(private readonly config: OnlineControllerConfig) {
    this.game = new GameSimulation({
      seed: config.seed,
      difficulty: config.difficulty,
      players: 2
    });
    if (config.options) this.game.setOptions(config.options);
    this.lockstep = new OnlineLockstepController({
      networkDelayTicks: config.sendInputBatch ? 0 : (config.networkDelayTicks ?? 0)
    });
    this.batchMode = Boolean(config.sendInputBatch);
    if (this.batchMode) {
      this.batchAssembler = new InputBatchAssembler(config.round ?? 0, config.playerId);
    }
    this.currentStatus = {
      phase: "waiting",
      lockstep: this.lockstep.status()
    };
    this.recentStateHashes.set(0, this.checkpoint().stateHash);
  }

  queueRemoteInput(tick: number, playerId: 0 | 1, input: NetworkPlayerInput): void {
    this.lockstep.bufferInput(tick, playerId, input);
  }

  queueRemoteBatch(batch: InputBatch): void {
    if (batch.round !== (this.config.round ?? 0) || batch.playerId === this.config.playerId) return;
    for (const [offset, input] of batch.frames.entries()) {
      this.lockstep.bufferInput(batch.startTick + offset, batch.playerId, {
        ...input,
        pausePressed: false
      });
    }
  }

  step(localInput: InputFrame): void {
    const input = {
      ...localInput.players[0],
      pausePressed: localInput.pausePressed
    };
    const outgoingTick = this.inputTick;
    this.lockstep.bufferInput(outgoingTick, this.config.playerId, input);
    if (this.batchMode) {
      const batch = this.batchAssembler!.push({ left: input.left, right: input.right });
      if (batch) {
        this.retainedBatches.set(batch.sequence, batch);
        while (this.retainedBatches.size > 120) {
          this.retainedBatches.delete(this.retainedBatches.keys().next().value!);
        }
        void this.transmitBatch(batch);
      }
    } else {
      void this.config.sendInput!(outgoingTick, this.config.playerId, input);
    }
    this.inputTick += 1;

    const delayTicks = this.batchMode
      ? (this.config.bufferTicks ?? 12)
      : (this.config.networkDelayTicks ?? 0);
    if (this.inputTick <= delayTicks) {
      this.currentStatus = {
        phase: "waiting",
        lockstep: this.lockstep.status()
      };
      return;
    }

    const simulationInput = this.lockstep.nextInputForSimulation(
      this.batchMode ? this.simulationTick : this.simulationTick + delayTicks
    );
    if (!simulationInput) {
      this.currentStatus = {
        phase: "waiting",
        lockstep: this.lockstep.status()
      };
      if (this.batchMode) {
        const waitingForTick = this.currentStatus.lockstep.waitingForTick;
        const missingSequence = waitingForTick === null
          ? null
          : Math.floor(waitingForTick / 3);
        this.publishStatus(missingSequence);
      }
      return;
    }

    this.game.step(simulationInput, STEP_MS);
    this.simulationTick += 1;
    this.currentStatus = {
      phase: "playing",
      lockstep: this.lockstep.status()
    };
    if (this.batchMode && this.lastPublishedMissingSequence !== null) {
      this.publishStatus(null);
    }
    if (this.batchMode && this.simulationTick % 60 === 0) {
      const checkpoint = this.checkpoint();
      this.recentStateHashes.set(this.simulationTick, checkpoint.stateHash);
      while (this.recentStateHashes.size > 3) {
        this.recentStateHashes.delete(this.recentStateHashes.keys().next().value!);
      }
      this.comparePeerState();
      this.publishStatus(null);
      if (this.config.playerId === 0) void this.config.publishCheckpoint?.(checkpoint);
    }
  }

  private publishStatus(missingSequence: number | null): void {
    if (!this.config.publishSyncStatus) return;
    if (missingSequence === this.lastPublishedMissingSequence && this.simulationTick % 60 !== 0) {
      return;
    }
    this.lastPublishedMissingSequence = missingSequence;
    void this.config.publishSyncStatus({
      simulationTick: this.simulationTick,
      confirmedInputTick: this.simulationTick - 1,
      missingSequence,
      stateHash: this.checkpoint().stateHash,
      connected: true,
      updatedAt: Date.now()
    });
  }

  receivePeerStatus(status: OnlineSyncStatus): void {
    this.latestPeerStatus = status;
    this.comparePeerState();
    for (const [sequence, batch] of this.retainedBatches) {
      const lastTick = batch.startTick + batch.frames.length - 1;
      if (lastTick > status.confirmedInputTick) continue;
      this.retainedBatches.delete(sequence);
      void this.config.removeInputBatch?.(sequence);
    }
    if (status.missingSequence !== null) this.resendBatch(status.missingSequence);
  }

  private comparePeerState(): void {
    if (!this.latestPeerStatus) return;
    const localHash = this.recentStateHashes.get(this.latestPeerStatus.simulationTick);
    if (localHash !== undefined) this.peerStateMatch = localHash === this.latestPeerStatus.stateHash;
  }

  resendBatch(sequence: number): boolean {
    const batch = this.retainedBatches.get(sequence);
    if (!batch || !this.config.sendInputBatch) return false;
    void this.transmitBatch(batch);
    return true;
  }

  private async transmitBatch(batch: InputBatch): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.config.sendInputBatch!(batch);
        return;
      } catch {
        if (attempt === 2) return;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.config.retryDelayMs ?? 100 * (attempt + 1));
        });
      }
    }
  }

  checkpoint(): OnlineCheckpoint {
    const checkpoint = this.game.exportCheckpoint();
    return {
      round: this.config.round ?? 0,
      tick: this.simulationTick,
      stateHash: checkpointHash(checkpoint),
      checkpoint
    };
  }

  applyHostCheckpoint(value: OnlineCheckpoint): boolean {
    if (value.round !== (this.config.round ?? 0)) return false;
    this.game.applyCheckpoint(value.checkpoint);
    this.simulationTick = value.tick;
    this.inputTick = Math.max(this.inputTick, value.tick + (this.config.bufferTicks ?? 12));
    this.batchAssembler?.seek(this.inputTick);
    this.lockstep.discardBefore(value.tick);
    this.recentStateHashes.clear();
    this.recentStateHashes.set(value.tick, value.stateHash);
    this.comparePeerState();
    return true;
  }

  syncStatus(): {
    inputTick: number;
    simulationTick: number;
    stateHash: string;
    waitingForTick: number | null;
    peerStateMatch: boolean | null;
  } {
    return {
      inputTick: this.inputTick,
      simulationTick: this.simulationTick,
      stateHash: this.checkpoint().stateHash,
      waitingForTick: this.currentStatus.lockstep.waitingForTick,
      peerStateMatch: this.peerStateMatch
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
