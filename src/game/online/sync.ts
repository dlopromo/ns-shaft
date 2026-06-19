import type { PlayerInput, SimulationCheckpoint } from "../types";

export const INPUT_BATCH_SIZE = 3;
export const DEFAULT_BUFFER_TICKS = 12;
export const MIN_BUFFER_TICKS = 6;
export const MAX_BUFFER_TICKS = 15;
const STEP_MS = 1000 / 60;

export interface NetworkTimingSample {
  rttMs: number;
  jitterMs: number;
}

export interface InputBatch {
  round: number;
  playerId: 0 | 1;
  sequence: number;
  startTick: number;
  frames: PlayerInput[];
}

export interface OnlineSyncStatus {
  simulationTick: number;
  confirmedInputTick: number;
  missingSequence: number | null;
  stateHash: string;
  connected: boolean;
  updatedAt: number;
}

export interface OnlineCheckpoint {
  round: number;
  tick: number;
  stateHash: string;
  checkpoint: SimulationCheckpoint;
}

export function selectBufferTicks(samples: NetworkTimingSample[]): number {
  if (samples.length === 0) return DEFAULT_BUFFER_TICKS;
  const requiredMs = Math.max(...samples.map((sample) =>
    Math.max(0, sample.rttMs) / 2 + Math.max(0, sample.jitterMs) * 2 + 50
  ));
  const rawTicks = Math.ceil(requiredMs / STEP_MS);
  const aligned = Math.ceil(rawTicks / INPUT_BATCH_SIZE) * INPUT_BATCH_SIZE;
  return Math.max(MIN_BUFFER_TICKS, Math.min(MAX_BUFFER_TICKS, aligned));
}

export class InputBatchAssembler {
  private sequence = 0;
  private nextTick = 0;
  private frames: PlayerInput[] = [];

  constructor(
    private readonly round: number,
    private readonly playerId: 0 | 1
  ) {}

  push(input: PlayerInput): InputBatch | null {
    this.frames.push({ ...input });
    this.nextTick += 1;
    if (this.frames.length < INPUT_BATCH_SIZE) return null;
    const frames = this.frames;
    this.frames = [];
    return {
      round: this.round,
      playerId: this.playerId,
      sequence: this.sequence++,
      startTick: this.nextTick - frames.length,
      frames
    };
  }

  seek(nextTick: number): void {
    this.nextTick = nextTick;
    this.sequence = Math.ceil(nextTick / INPUT_BATCH_SIZE);
    this.frames = [];
  }
}

export function checkpointHash(checkpoint: SimulationCheckpoint): string {
  const value = JSON.stringify(checkpoint);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
