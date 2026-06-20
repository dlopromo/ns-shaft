import type { Checkpoint, InputBatch, PlayerId } from "./types.js";

export interface LockstepOptions<TInput> {
  localPlayerId: PlayerId;
  participants: readonly PlayerId[];
  neutralInput: () => TInput;
  inputDelayTicks?: number;
  minInputDelayTicks?: number;
  maxInputDelayTicks?: number;
  tickRate?: number;
}

export class LockstepSync<TInput, TCheckpoint> {
  tick = 0;
  participantEpoch = 1;
  checkpoint: Checkpoint<TCheckpoint> | null = null;
  inputDelayTicks: number;
  private participants: PlayerId[];
  private readonly inputs = new Map<PlayerId, Map<number, TInput>>();
  private readonly neutralInput: () => TInput;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly tickRate: number;

  constructor(readonly options: LockstepOptions<TInput>) {
    this.participants = [...options.participants];
    this.neutralInput = options.neutralInput;
    this.inputDelayTicks = options.inputDelayTicks ?? 3;
    this.minDelay = options.minInputDelayTicks ?? 2;
    this.maxDelay = options.maxInputDelayTicks ?? 12;
    this.tickRate = options.tickRate ?? 60;
    this.prepareBuffers();
  }

  queueLocal(input: TInput): InputBatch<TInput> {
    const frame = { tick: this.tick + this.inputDelayTicks, input };
    this.inputs.get(this.options.localPlayerId)?.set(frame.tick, input);
    return { playerId: this.options.localPlayerId, participantEpoch: this.participantEpoch, frames: [frame] };
  }

  receiveInputs(batch: InputBatch<TInput>): boolean {
    if (batch.participantEpoch !== this.participantEpoch || !this.participants.includes(batch.playerId)) return false;
    const buffer = this.inputs.get(batch.playerId)!;
    for (const frame of batch.frames) if (frame.tick >= this.tick) buffer.set(frame.tick, frame.input);
    return true;
  }

  takeFrame(tick = this.tick): ReadonlyMap<PlayerId, TInput> | null {
    const frame = new Map<PlayerId, TInput>();
    for (const id of this.participants) {
      const input = this.inputs.get(id)?.get(tick);
      if (input === undefined) return null;
      frame.set(id, input);
    }
    for (const id of this.participants) this.inputs.get(id)?.delete(tick);
    this.tick = tick + 1;
    return frame;
  }

  fillNeutralUntil(targetTick: number): void {
    for (const id of this.participants) {
      const buffer = this.inputs.get(id)!;
      for (let tick = this.tick; tick <= targetTick; tick++) if (!buffer.has(tick)) buffer.set(tick, this.neutralInput());
    }
  }

  setParticipants(participants: readonly PlayerId[], participantEpoch: number): void {
    if (participantEpoch <= this.participantEpoch) return;
    this.participants = [...participants];
    this.participantEpoch = participantEpoch;
    this.inputs.clear();
    this.prepareBuffers();
  }

  applyCheckpoint(checkpoint: Checkpoint<TCheckpoint>): void {
    if (checkpoint.participantEpoch < this.participantEpoch) return;
    this.checkpoint = checkpoint;
    this.tick = checkpoint.tick;
    this.participantEpoch = checkpoint.participantEpoch;
    this.inputs.clear();
    this.prepareBuffers();
  }

  observeRoundTrip(roundTripMs: number): number {
    const oneWayTicks = Math.ceil((Math.max(0, roundTripMs) / 2) * this.tickRate / 1000) + 1;
    const target = Math.min(this.maxDelay, Math.max(this.minDelay, oneWayTicks));
    this.inputDelayTicks += Math.sign(target - this.inputDelayTicks);
    return this.inputDelayTicks;
  }

  private prepareBuffers(): void {
    for (const id of this.participants) this.inputs.set(id, new Map());
  }
}
