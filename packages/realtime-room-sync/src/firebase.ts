import { get, onChildAdded, onValue, push, ref, remove, runTransaction, set, type Database } from "firebase/database";
import type { Checkpoint, InputBatch, RealtimeRoomTransport, RoomState, Snapshot, Unsubscribe } from "./types.js";

export interface FirebaseRealtimeTransportOptions {
  database: Database;
  namespace: string;
}

export class FirebaseRealtimeTransport<TSettings> implements RealtimeRoomTransport<TSettings> {
  private readonly root: string;

  constructor(private readonly options: FirebaseRealtimeTransportOptions) {
    const namespace = options.namespace.trim().replace(/^\/+|\/+$/g, "");
    if (!namespace || namespace.split("/").some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("A Firebase-safe namespace is required");
    this.root = `${namespace}/rooms`;
  }

  async createRoom(code: string, state: RoomState<TSettings>): Promise<boolean> {
    const result = await runTransaction(this.roomRef(code), (current) => current === null ? state : undefined, { applyLocally: false });
    return result.committed;
  }

  async readRoom(code: string): Promise<RoomState<TSettings> | null> {
    const snapshot = await get(this.roomRef(code));
    return snapshot.exists() ? snapshot.val() as RoomState<TSettings> : null;
  }

  async transactRoom(code: string, update: (room: RoomState<TSettings> | null) => RoomState<TSettings> | null): Promise<RoomState<TSettings> | null> {
    let thrown: unknown;
    const result = await runTransaction(this.roomRef(code), (current) => {
      try { return update(current as RoomState<TSettings> | null); }
      catch (error) { thrown = error; return undefined; }
    }, { applyLocally: false });
    if (thrown) throw thrown;
    return result.snapshot.exists() ? result.snapshot.val() as RoomState<TSettings> : null;
  }

  subscribeRoom(code: string, listener: (room: RoomState<TSettings> | null) => void): Unsubscribe {
    return onValue(this.roomRef(code), (snapshot) => listener(snapshot.exists() ? snapshot.val() as RoomState<TSettings> : null));
  }

  async deleteRoom(code: string): Promise<void> { await remove(this.roomRef(code)); }

  async publishInput<TInput>(code: string, round: number, batch: InputBatch<TInput>): Promise<void> {
    await push(ref(this.options.database, `${this.root}/${code}/inputs/${round}`), batch);
  }

  subscribeInputs<TInput>(code: string, round: number, listener: (batch: InputBatch<TInput>) => void): Unsubscribe {
    return onChildAdded(ref(this.options.database, `${this.root}/${code}/inputs/${round}`), (snapshot) => listener(snapshot.val() as InputBatch<TInput>));
  }

  async publishSnapshot<TState>(code: string, round: number, snapshot: Snapshot<TState>): Promise<void> {
    await set(ref(this.options.database, `${this.root}/${code}/snapshots/${round}/${snapshot.playerId}`), snapshot);
  }

  subscribeSnapshots<TState>(code: string, round: number, listener: (snapshot: Snapshot<TState>) => void): Unsubscribe {
    return onValue(ref(this.options.database, `${this.root}/${code}/snapshots/${round}`), (snapshot) => {
      for (const value of Object.values(snapshot.val() ?? {})) listener(value as Snapshot<TState>);
    });
  }

  async publishCheckpoint<TCheckpoint>(code: string, round: number, checkpoint: Checkpoint<TCheckpoint>): Promise<void> {
    await set(ref(this.options.database, `${this.root}/${code}/checkpoints/${round}`), checkpoint);
  }

  subscribeCheckpoint<TCheckpoint>(code: string, round: number, listener: (checkpoint: Checkpoint<TCheckpoint>) => void): Unsubscribe {
    return onValue(ref(this.options.database, `${this.root}/${code}/checkpoints/${round}`), (snapshot) => { if (snapshot.exists()) listener(snapshot.val() as Checkpoint<TCheckpoint>); });
  }

  private roomRef(code: string) { return ref(this.options.database, `${this.root}/${code}`); }
}

export type { FirebaseRealtimeTransportOptions as FirebaseTransportOptions };
