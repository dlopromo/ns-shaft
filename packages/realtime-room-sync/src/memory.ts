import type { Checkpoint, InputBatch, RealtimeRoomTransport, RoomState, Snapshot, Unsubscribe } from "./types.js";

export class InMemoryRealtimeRoomTransport<TSettings> implements RealtimeRoomTransport<TSettings> {
  private readonly rooms = new Map<string, RoomState<TSettings>>();
  private readonly roomListeners = new Map<string, Set<(room: RoomState<TSettings> | null) => void>>();
  private readonly channelListeners = new Map<string, Set<(value: unknown) => void>>();

  async createRoom(code: string, state: RoomState<TSettings>): Promise<boolean> { if (this.rooms.has(code)) return false; this.rooms.set(code, clone(state)); this.emitRoom(code); return true; }
  async readRoom(code: string): Promise<RoomState<TSettings> | null> { return clone(this.rooms.get(code) ?? null); }
  async transactRoom(code: string, update: (room: RoomState<TSettings> | null) => RoomState<TSettings> | null): Promise<RoomState<TSettings> | null> { const next = update(clone(this.rooms.get(code) ?? null)); if (next) this.rooms.set(code, clone(next)); else this.rooms.delete(code); this.emitRoom(code); return clone(next); }
  subscribeRoom(code: string, listener: (room: RoomState<TSettings> | null) => void): Unsubscribe { const listeners = this.roomListeners.get(code) ?? new Set(); listeners.add(listener); this.roomListeners.set(code, listeners); listener(clone(this.rooms.get(code) ?? null)); return () => listeners.delete(listener); }
  async deleteRoom(code: string): Promise<void> { this.rooms.delete(code); this.emitRoom(code); }
  async publishInput<TInput>(code: string, round: number, batch: InputBatch<TInput>): Promise<void> { this.emit(`inputs/${code}/${round}`, batch); }
  subscribeInputs<TInput>(code: string, round: number, listener: (batch: InputBatch<TInput>) => void): Unsubscribe { return this.on(`inputs/${code}/${round}`, listener as (value: unknown) => void); }
  async publishSnapshot<TState>(code: string, round: number, snapshot: Snapshot<TState>): Promise<void> { this.emit(`snapshots/${code}/${round}`, snapshot); }
  subscribeSnapshots<TState>(code: string, round: number, listener: (snapshot: Snapshot<TState>) => void): Unsubscribe { return this.on(`snapshots/${code}/${round}`, listener as (value: unknown) => void); }
  async publishCheckpoint<TCheckpoint>(code: string, round: number, checkpoint: Checkpoint<TCheckpoint>): Promise<void> { this.emit(`checkpoints/${code}/${round}`, checkpoint); }
  subscribeCheckpoint<TCheckpoint>(code: string, round: number, listener: (checkpoint: Checkpoint<TCheckpoint>) => void): Unsubscribe { return this.on(`checkpoints/${code}/${round}`, listener as (value: unknown) => void); }
  private emitRoom(code: string): void { const room = clone(this.rooms.get(code) ?? null); for (const listener of this.roomListeners.get(code) ?? []) listener(room); }
  private on(channel: string, listener: (value: unknown) => void): Unsubscribe { const listeners = this.channelListeners.get(channel) ?? new Set(); listeners.add(listener); this.channelListeners.set(channel, listeners); return () => listeners.delete(listener); }
  private emit(channel: string, value: unknown): void { for (const listener of this.channelListeners.get(channel) ?? []) listener(clone(value)); }
}

function clone<T>(value: T): T { return value === undefined ? value : structuredClone(value); }
