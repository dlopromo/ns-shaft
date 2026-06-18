import type { Difficulty, PlayerInput } from "../types";
import type { RaceSnapshot } from "./race";
import { generateRoomCode, validateRoomCode } from "./room";

export type OnlineRoomMode = "coop" | "race";

export interface OnlineMechanismOptions {
  conveyor: boolean;
  spring: boolean;
  rotating: boolean;
  fast: boolean;
}

export interface CreateRoomOptions {
  playerName: string;
  seed: number;
  difficulty: Difficulty;
  mode: OnlineRoomMode;
  options: OnlineMechanismOptions;
}

export interface OnlineRoomHandle {
  roomCode: string;
  role: "host" | "guest";
  playerId: 0 | 1;
  mode: OnlineRoomMode;
}

export interface OnlineDatabasePort {
  get(path: string): Promise<unknown>;
  set(path: string, value: unknown): Promise<void>;
  update(path: string, value: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  onValue(path: string, callback: (value: unknown) => void): () => void;
  onDisconnectRemove(path: string): void;
  getServerTimeOffset(): Promise<number>;
}

export interface NetworkInput extends PlayerInput {
  pausePressed: boolean;
}

export class FirebaseOnlineSession {
  constructor(
    private readonly database: OnlineDatabasePort,
    private readonly codeGenerator = generateRoomCode
  ) {}

  async createRoom(options: CreateRoomOptions): Promise<OnlineRoomHandle> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomCode = this.codeGenerator();
      const metaPath = this.metaPath(roomCode);
      if (await this.database.get(metaPath)) continue;
      await this.database.set(metaPath, {
        seed: options.seed,
        difficulty: options.difficulty,
        mode: options.mode,
        options: options.options,
        phase: "lobby",
        round: 0,
        hostConnected: true,
        guestConnected: false,
        createdAt: Date.now()
      });
      await this.database.set(this.playerPath(roomCode, 0), {
        name: options.playerName || "HOST",
        role: "host",
        ready: false,
        connected: true
      });
      this.database.onDisconnectRemove(`rooms/${roomCode}`);
      return { roomCode, role: "host", playerId: 0, mode: options.mode };
    }
    throw new Error("Unable to allocate room code");
  }

  async joinRoom(roomCodeInput: string, playerName: string): Promise<OnlineRoomHandle> {
    const validation = validateRoomCode(roomCodeInput);
    if (!validation.ok) throw new Error(validation.reason);
    const roomCode = validation.code;
    const meta = await this.database.get(this.metaPath(roomCode)) as
      { phase?: string; guestConnected?: boolean; mode?: OnlineRoomMode } | null;
    if (!meta) throw new Error("Room not found");
    if (meta.phase !== "lobby") throw new Error("Room is not in lobby");
    if (meta.guestConnected) throw new Error("Room is full");
    await this.database.set(this.playerPath(roomCode, 1), {
      name: playerName || "GUEST",
      role: "guest",
      ready: false,
      connected: true
    });
    await this.database.update(this.metaPath(roomCode), { guestConnected: true });
    this.database.onDisconnectRemove(this.playerPath(roomCode, 1));
    return { roomCode, role: "guest", playerId: 1, mode: meta.mode ?? "coop" };
  }

  async setReady(roomCode: string, playerId: 0 | 1, ready: boolean): Promise<void> {
    await this.database.update(this.playerPath(roomCode, playerId), { ready });
  }

  getServerTimeOffset(): Promise<number> {
    return this.database.getServerTimeOffset();
  }

  async beginCountdown(
    roomCode: string,
    value: { seed: number; round: number; countdownEndsAt: number }
  ): Promise<void> {
    await Promise.all([
      this.database.remove(`rooms/${roomCode}/inputs`),
      this.database.remove(`rooms/${roomCode}/raceSnapshots`)
    ]);
    await this.database.update(this.metaPath(roomCode), {
      phase: "countdown",
      seed: value.seed,
      round: value.round,
      countdownEndsAt: value.countdownEndsAt,
      resultsEndsAt: null
    });
  }

  async beginPlaying(roomCode: string): Promise<void> {
    await this.database.update(this.metaPath(roomCode), { phase: "playing" });
  }

  async beginResults(roomCode: string, resultsEndsAt: number): Promise<void> {
    await this.database.update(this.metaPath(roomCode), {
      phase: "results",
      resultsEndsAt
    });
  }

  async resetForRematch(roomCode: string): Promise<void> {
    await Promise.all([
      this.database.update(this.playerPath(roomCode, 0), { ready: false }),
      this.database.update(this.playerPath(roomCode, 1), { ready: false })
    ]);
    await this.database.update(this.metaPath(roomCode), {
      phase: "lobby",
      countdownEndsAt: null,
      resultsEndsAt: null
    });
  }

  async updateMeta(roomCode: string, value: Record<string, unknown>): Promise<void> {
    await this.database.update(this.metaPath(roomCode), value);
  }

  async sendInput(
    roomCode: string,
    tick: number,
    playerId: 0 | 1,
    input: NetworkInput
  ): Promise<void> {
    await this.database.set(`rooms/${roomCode}/inputs/${tick}/${playerId}`, {
      left: input.left,
      right: input.right,
      pausePressed: input.pausePressed
    });
  }

  async sendRaceSnapshot(
    roomCode: string,
    playerId: 0 | 1,
    snapshot: RaceSnapshot
  ): Promise<void> {
    await this.database.set(`rooms/${roomCode}/raceSnapshots/${playerId}`, snapshot);
  }

  async leaveRoom(roomCode: string, playerId: 0 | 1): Promise<void> {
    if (playerId === 0) {
      await this.database.remove(`rooms/${roomCode}`);
      return;
    }
    await this.database.remove(this.playerPath(roomCode, playerId));
    await this.database.update(this.playerPath(roomCode, 0), { ready: false });
    await this.database.update(this.metaPath(roomCode), {
      phase: "lobby",
      guestConnected: false,
      countdownEndsAt: null,
      resultsEndsAt: null
    });
  }

  subscribeRoom(roomCode: string, callback: (value: unknown) => void): () => void {
    return this.database.onValue(`rooms/${roomCode}`, callback);
  }

  subscribeInputs(roomCode: string, callback: (value: unknown) => void): () => void {
    return this.database.onValue(`rooms/${roomCode}/inputs`, callback);
  }

  subscribeRaceSnapshots(roomCode: string, callback: (value: unknown) => void): () => void {
    return this.database.onValue(`rooms/${roomCode}/raceSnapshots`, callback);
  }

  private metaPath(roomCode: string): string {
    return `rooms/${roomCode}/meta`;
  }

  private playerPath(roomCode: string, playerId: 0 | 1): string {
    return `rooms/${roomCode}/players/${playerId}`;
  }
}
