import type { Difficulty, PlayerInput } from "../types";
import type { RaceSnapshot } from "./race";
import type {
  InputBatch,
  NetworkTimingSample,
  OnlineCheckpoint,
  OnlineSyncStatus
} from "./sync";
import { generateRoomCode, validateRoomCode } from "./room";

export const FIREBASE_ROOT = "ns-shaft";
export const RECONNECT_GRACE_MS = 60_000;

export type OnlineRoomMode = "coop" | "race";

export interface OnlineMechanismOptions {
  conveyor: boolean;
  spring: boolean;
  rotating: boolean;
  fast: boolean;
}

export interface OnlineRoomSettings {
  difficulty: Difficulty;
  mode: OnlineRoomMode;
  options: OnlineMechanismOptions;
}

export const DEFAULT_ONLINE_ROOM_SETTINGS: OnlineRoomSettings = {
  difficulty: "normal",
  mode: "coop",
  options: { conveyor: true, spring: true, rotating: true, fast: false }
};

export function normalizeOnlineRoomSettings(
  value?: Partial<Omit<OnlineRoomSettings, "options">> & {
    options?: Partial<OnlineMechanismOptions>;
  }
): OnlineRoomSettings {
  return {
    difficulty: value?.difficulty ?? DEFAULT_ONLINE_ROOM_SETTINGS.difficulty,
    mode: value?.mode ?? DEFAULT_ONLINE_ROOM_SETTINGS.mode,
    options: {
      conveyor: value?.options?.conveyor ?? DEFAULT_ONLINE_ROOM_SETTINGS.options.conveyor,
      spring: value?.options?.spring ?? DEFAULT_ONLINE_ROOM_SETTINGS.options.spring,
      rotating: value?.options?.rotating ?? DEFAULT_ONLINE_ROOM_SETTINGS.options.rotating,
      fast: value?.options?.fast ?? DEFAULT_ONLINE_ROOM_SETTINGS.options.fast
    }
  };
}

export interface CreateRoomOptions extends OnlineRoomSettings {
  playerName: string;
  seed: number;
  roomCode?: string;
}

export interface OnlineRoomHandle {
  roomCode: string;
  role: "host" | "guest";
  playerId: 0 | 1;
  mode: OnlineRoomMode;
}

export interface OnlineDatabasePort {
  ensureAuthenticated(): Promise<string>;
  get(path: string): Promise<unknown>;
  set(path: string, value: unknown): Promise<void>;
  update(path: string, value: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  onValue(path: string, callback: (value: unknown) => void): () => void;
  onChild(path: string, callback: (value: unknown) => void): () => void;
  onDisconnectRemove(path: string): void;
  onDisconnectSet(path: string, value: unknown): Promise<void>;
  cancelOnDisconnect(path: string): Promise<void>;
  getServerTimeOffset(): Promise<number>;
  serverTimestamp(): unknown;
}

export interface NetworkInput extends PlayerInput {
  pausePressed: boolean;
}

export class FirebaseOnlineSession {
  constructor(
    private readonly database: OnlineDatabasePort,
    private readonly codeGenerator = generateRoomCode,
    private readonly now = Date.now
  ) {}

  async createRoom(options: CreateRoomOptions): Promise<OnlineRoomHandle> {
    const uid = await this.database.ensureAuthenticated();
    const requested = options.roomCode?.trim();
    if (requested) {
      const metaPath = this.metaPath(requested);
      if (await this.database.get(metaPath)) throw new Error("Room already exists");
      await this.writeRoomMeta(metaPath, requested, options, uid);
      return { roomCode: requested, role: "host", playerId: 0, mode: options.mode };
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomCode = this.codeGenerator();
      const metaPath = this.metaPath(roomCode);
      if (await this.database.get(metaPath)) continue;
      await this.writeRoomMeta(metaPath, roomCode, options, uid);
      return { roomCode, role: "host", playerId: 0, mode: options.mode };
    }
    throw new Error("Unable to allocate room code");
  }

  private async writeRoomMeta(
    metaPath: string, roomCode: string, options: CreateRoomOptions, uid: string
  ): Promise<void> {
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
      uid,
      role: "host",
      ready: false,
      connected: true,
      lastSeen: this.database.serverTimestamp()
    });
    await this.armPresenceDisconnect(roomCode, 0);
  }

  async joinRoom(roomCodeInput: string, playerName: string): Promise<OnlineRoomHandle> {
    const uid = await this.database.ensureAuthenticated();
    const validation = validateRoomCode(roomCodeInput);
    if (!validation.ok) throw new Error(validation.reason);
    const roomCode = validation.code;
    const meta = await this.database.get(this.metaPath(roomCode)) as
      { phase?: string; guestConnected?: boolean; mode?: OnlineRoomMode } | null;
    if (!meta) throw new Error("Room not found");
    if (meta.phase !== "lobby") throw new Error("Room is not in lobby");
    if (meta.guestConnected) {
      const guest = await this.database.get(this.playerPath(roomCode, 1)) as {
        connected?: boolean;
        lastSeen?: number;
      } | null;
      const slotReserved = guest?.connected || typeof guest?.lastSeen !== "number" ||
        this.now() - guest.lastSeen <= RECONNECT_GRACE_MS;
      if (slotReserved) throw new Error("Room is full");
    }
    await this.database.set(this.playerPath(roomCode, 1), {
      name: playerName || "GUEST",
      uid,
      role: "guest",
      ready: false,
      connected: true,
      lastSeen: this.database.serverTimestamp()
    });
    await this.database.update(this.metaPath(roomCode), { guestConnected: true });
    await this.armPresenceDisconnect(roomCode, 1);
    return { roomCode, role: "guest", playerId: 1, mode: meta.mode ?? "coop" };
  }

  async resumeRoom(
    roomCodeInput: string,
    playerId: 0 | 1,
    playerName: string
  ): Promise<OnlineRoomHandle> {
    const uid = await this.database.ensureAuthenticated();
    const validation = validateRoomCode(roomCodeInput);
    if (!validation.ok) throw new Error(validation.reason);
    const roomCode = validation.code;
    const [meta, player] = await Promise.all([
      this.database.get(this.metaPath(roomCode)),
      this.database.get(this.playerPath(roomCode, playerId))
    ]) as [
      { mode?: OnlineRoomMode } | null,
      { uid?: string; connected?: boolean; lastSeen?: number; ready?: boolean } | null
    ];
    if (!meta) throw new Error("Room not found");
    if (!player || player.uid !== uid) throw new Error("Player slot unavailable");
    if (!player.connected && typeof player.lastSeen === "number" &&
        this.now() - player.lastSeen > RECONNECT_GRACE_MS) {
      throw new Error("Reconnect expired");
    }
    await this.database.update(this.playerPath(roomCode, playerId), {
      name: playerName,
      connected: true,
      lastSeen: this.database.serverTimestamp()
    });
    await this.database.update(this.metaPath(roomCode), {
      [playerId === 0 ? "hostConnected" : "guestConnected"]: true
    });
    await this.armPresenceDisconnect(roomCode, playerId);
    return {
      roomCode,
      role: playerId === 0 ? "host" : "guest",
      playerId,
      mode: meta.mode ?? "coop"
    };
  }

  private async armPresenceDisconnect(roomCode: string, playerId: 0 | 1): Promise<void> {
    await Promise.all([
      this.database.onDisconnectSet(`${this.playerPath(roomCode, playerId)}/connected`, false),
      this.database.onDisconnectSet(
      `${this.playerPath(roomCode, playerId)}/lastSeen`,
      this.database.serverTimestamp()
      ),
      this.database.onDisconnectSet(
      `${this.metaPath(roomCode)}/${playerId === 0 ? "hostConnected" : "guestConnected"}`,
      false
      )
    ]);
  }

  private async disarmPresenceDisconnect(roomCode: string, playerId: 0 | 1): Promise<void> {
    await Promise.all([
      this.database.cancelOnDisconnect(`${this.playerPath(roomCode, playerId)}/connected`),
      this.database.cancelOnDisconnect(`${this.playerPath(roomCode, playerId)}/lastSeen`),
      this.database.cancelOnDisconnect(
        `${this.metaPath(roomCode)}/${playerId === 0 ? "hostConnected" : "guestConnected"}`
      )
    ]);
  }

  async measureNetworkTiming(
    roomCode: string,
    playerId: 0 | 1
  ): Promise<NetworkTimingSample> {
    const samples: number[] = [];
    const path = `${this.roomPath(roomCode)}/latency/${playerId}`;
    for (let index = 0; index < 5; index += 1) {
      const startedAt = this.now();
      await this.database.set(path, index);
      samples.push(Math.max(0, this.now() - startedAt));
    }
    await this.database.remove(path);
    const rttMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
    const jitterMs = samples.reduce(
      (total, sample) => total + Math.abs(sample - rttMs),
      0
    ) / samples.length;
    const timing = { rttMs, jitterMs };
    await this.database.update(this.playerPath(roomCode, playerId), { timing });
    return timing;
  }

  async setReady(roomCode: string, playerId: 0 | 1, ready: boolean): Promise<void> {
    await this.database.update(this.playerPath(roomCode, playerId), { ready });
  }

  async setPauseReady(roomCode: string, playerId: 0 | 1, ready: boolean): Promise<void> {
    await this.database.set(`${this.metaPath(roomCode)}/pause/ready/${playerId}`, ready);
  }

  getServerTimeOffset(): Promise<number> {
    return this.database.getServerTimeOffset();
  }

  async beginCountdown(
    roomCode: string,
    value: { seed: number; round: number; countdownEndsAt: number; bufferTicks?: number }
  ): Promise<void> {
    await Promise.all([
      this.database.remove(`${this.roomPath(roomCode)}/inputs`),
      this.database.remove(`${this.roomPath(roomCode)}/raceSnapshots`)
    ]);
    await this.database.update(this.metaPath(roomCode), {
      phase: "countdown",
      seed: value.seed,
      round: value.round,
      bufferTicks: value.bufferTicks ?? 12,
      countdownEndsAt: value.countdownEndsAt,
      resultsEndsAt: null,
      resultRanks: null
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
    await this.database.set(`${this.roomPath(roomCode)}/inputs/${tick}/${playerId}`, {
      left: input.left,
      right: input.right,
      pausePressed: input.pausePressed
    });
  }

  async sendInputBatch(roomCode: string, batch: InputBatch): Promise<void> {
    await this.database.set(
      `${this.roomPath(roomCode)}/transport/${batch.round}/inputs/${batch.playerId}/${batch.sequence}`,
      batch
    );
  }

  async removeInputBatch(
    roomCode: string,
    round: number,
    playerId: 0 | 1,
    sequence: number
  ): Promise<void> {
    await this.database.remove(
      `${this.roomPath(roomCode)}/transport/${round}/inputs/${playerId}/${sequence}`
    );
  }

  subscribeInputBatches(
    roomCode: string,
    round: number,
    opponentId: 0 | 1,
    callback: (batch: InputBatch) => void
  ): () => void {
    return this.database.onChild(
      `${this.roomPath(roomCode)}/transport/${round}/inputs/${opponentId}`,
      (value) => callback(value as InputBatch)
    );
  }

  async sendSyncStatus(
    roomCode: string,
    round: number,
    playerId: 0 | 1,
    status: OnlineSyncStatus
  ): Promise<void> {
    await this.database.set(
      `${this.roomPath(roomCode)}/transport/${round}/status/${playerId}`,
      status
    );
  }

  subscribeSyncStatus(
    roomCode: string,
    round: number,
    playerId: 0 | 1,
    callback: (status: OnlineSyncStatus | null) => void
  ): () => void {
    return this.database.onValue(
      `${this.roomPath(roomCode)}/transport/${round}/status/${playerId}`,
      (value) => callback(value as OnlineSyncStatus | null)
    );
  }

  async sendCheckpoint(
    roomCode: string,
    round: number,
    checkpoint: OnlineCheckpoint
  ): Promise<void> {
    await this.database.set(
      `${this.roomPath(roomCode)}/transport/${round}/checkpoint`,
      checkpoint
    );
  }

  subscribeCheckpoint(
    roomCode: string,
    round: number,
    callback: (checkpoint: OnlineCheckpoint | null) => void
  ): () => void {
    return this.database.onValue(
      `${this.roomPath(roomCode)}/transport/${round}/checkpoint`,
      (value) => callback(value as OnlineCheckpoint | null)
    );
  }

  async sendRaceSnapshot(
    roomCode: string,
    playerId: 0 | 1,
    snapshot: RaceSnapshot
  ): Promise<void> {
    await this.database.set(
      `${this.roomPath(roomCode)}/raceSnapshots/${snapshot.round}/${playerId}`,
      snapshot
    );
  }

  async leaveRoom(roomCode: string, playerId: 0 | 1): Promise<void> {
    await this.disarmPresenceDisconnect(roomCode, playerId);
    if (playerId === 0) {
      await this.database.remove(this.roomPath(roomCode));
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
    return this.database.onValue(this.roomPath(roomCode), callback);
  }

  subscribeInputs(roomCode: string, callback: (value: unknown) => void): () => void {
    return this.database.onValue(`${this.roomPath(roomCode)}/inputs`, callback);
  }

  subscribeRaceSnapshots(
    roomCode: string,
    round: number,
    opponentId: 0 | 1,
    callback: (value: RaceSnapshot | null) => void
  ): () => void {
    return this.database.onValue(
      `${this.roomPath(roomCode)}/raceSnapshots/${round}/${opponentId}`,
      (value) => callback(value as RaceSnapshot | null)
    );
  }

  private metaPath(roomCode: string): string {
    return `${this.roomPath(roomCode)}/meta`;
  }

  private playerPath(roomCode: string, playerId: 0 | 1): string {
    return `${this.roomPath(roomCode)}/players/${playerId}`;
  }

  private roomPath(roomCode: string): string {
    return `${FIREBASE_ROOT}/rooms/${roomCode}`;
  }
}
