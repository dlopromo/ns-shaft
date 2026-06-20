import type { PlayerId, Snapshot } from "./types.js";

export interface SnapshotOptions<TState> {
  localPlayerId: PlayerId;
  round: number;
  heartbeatMs?: number;
  interpolate?: (previous: TState, next: TState, amount: number) => TState;
  equals?: (a: TState, b: TState) => boolean;
}

export class SnapshotSync<TState> {
  private sequence = 0;
  private lastPublishedAt = -Infinity;
  private lastPublishedState: TState | undefined;
  private readonly remote = new Map<PlayerId, Snapshot<TState>[]>();

  constructor(private readonly options: SnapshotOptions<TState>) {}

  publish(state: TState, now: number, force = false): Snapshot<TState> | null {
    const equals = this.options.equals ?? Object.is;
    const changed = this.lastPublishedState === undefined || !equals(this.lastPublishedState, state);
    if (!force && !changed && now - this.lastPublishedAt < (this.options.heartbeatMs ?? 1000)) return null;
    this.lastPublishedAt = now;
    this.lastPublishedState = state;
    return { playerId: this.options.localPlayerId, round: this.options.round, sequence: ++this.sequence, sentAt: now, state };
  }

  receive(snapshot: Snapshot<TState>): boolean {
    if (snapshot.playerId === this.options.localPlayerId || snapshot.round !== this.options.round) return false;
    const samples = this.remote.get(snapshot.playerId) ?? [];
    if (samples.length && samples[samples.length - 1].sequence >= snapshot.sequence) return false;
    samples.push(snapshot);
    if (samples.length > 2) samples.shift();
    this.remote.set(snapshot.playerId, samples);
    return true;
  }

  sample(playerId: PlayerId, now: number, delayMs = 0): TState | null {
    const samples = this.remote.get(playerId);
    if (!samples?.length) return null;
    if (samples.length === 1 || !this.options.interpolate) return samples[samples.length - 1].state;
    const [previous, next] = samples;
    const target = now - delayMs;
    const span = Math.max(1, next.sentAt - previous.sentAt);
    const amount = Math.min(1, Math.max(0, (target - previous.sentAt) / span));
    return this.options.interpolate(previous.state, next.state, amount);
  }

  remoteAge(playerId: PlayerId, now: number): number | null {
    const samples = this.remote.get(playerId);
    return samples?.length ? Math.max(0, now - samples[samples.length - 1].sentAt) : null;
  }
}
