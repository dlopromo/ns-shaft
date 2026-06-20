export type PlayerId = number;
export type RoomCapacity = 2 | 3 | 4;
export type RoomPhase = "lobby" | "countdown" | "playing" | "paused" | "results" | "closed";

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  clientId: string;
  resumeToken: string;
  connected: boolean;
  ready: boolean;
  pauseReady: boolean;
  lastSeenAt: number;
  disconnectedAt?: number;
}

export interface RoomMeta<TSettings> {
  code: string;
  capacity: RoomCapacity;
  hostId: 0;
  phase: RoomPhase;
  round: number;
  participantEpoch: number;
  activePlayerIds: PlayerId[];
  settings: TSettings;
  countdownEndsAt?: number;
  resumeAt?: number;
  results?: unknown;
}

export interface RoomState<TSettings> {
  meta: RoomMeta<TSettings>;
  players: Partial<Record<PlayerId, RoomPlayer>>;
}

export interface RoomHandle {
  code: string;
  playerId: PlayerId;
  resumeToken: string;
}

export interface InputFrame<TInput> { tick: number; input: TInput }
export interface InputBatch<TInput> {
  playerId: PlayerId;
  participantEpoch: number;
  frames: InputFrame<TInput>[];
}

export interface Checkpoint<TCheckpoint> {
  tick: number;
  participantEpoch: number;
  state: TCheckpoint;
  hash: string;
}

export interface Snapshot<TState> {
  playerId: PlayerId;
  round: number;
  sequence: number;
  sentAt: number;
  state: TState;
}

export type Unsubscribe = () => void;

export interface RealtimeRoomTransport<TSettings> {
  createRoom(code: string, state: RoomState<TSettings>): Promise<boolean>;
  readRoom(code: string): Promise<RoomState<TSettings> | null>;
  transactRoom(code: string, update: (room: RoomState<TSettings> | null) => RoomState<TSettings> | null): Promise<RoomState<TSettings> | null>;
  subscribeRoom(code: string, listener: (room: RoomState<TSettings> | null) => void): Unsubscribe;
  deleteRoom(code: string): Promise<void>;
  publishInput<TInput>(code: string, round: number, batch: InputBatch<TInput>): Promise<void>;
  subscribeInputs<TInput>(code: string, round: number, listener: (batch: InputBatch<TInput>) => void): Unsubscribe;
  publishSnapshot<TState>(code: string, round: number, snapshot: Snapshot<TState>): Promise<void>;
  subscribeSnapshots<TState>(code: string, round: number, listener: (snapshot: Snapshot<TState>) => void): Unsubscribe;
  publishCheckpoint<TCheckpoint>(code: string, round: number, checkpoint: Checkpoint<TCheckpoint>): Promise<void>;
  subscribeCheckpoint<TCheckpoint>(code: string, round: number, listener: (checkpoint: Checkpoint<TCheckpoint>) => void): Unsubscribe;
}
