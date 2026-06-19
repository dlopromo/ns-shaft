import { GameSimulation } from "../simulation";
import type { Difficulty, GameStateSnapshot, InputFrame } from "../types";
import type { OnlineMechanismOptions } from "./session";

const STEP_MS = 1000 / 60;
const MIN_REMOTE_RENDER_DELAY_MS = 100;
const MAX_REMOTE_RENDER_DELAY_MS = 250;
export const RACE_HEARTBEAT_MS = 1000;

export interface RaceSnapshot {
  playerId: 0 | 1;
  name: string;
  round: number;
  sequence: number;
  sentAt: number;
  finishedFloor: number;
  finishedAt?: number;
  state: GameStateSnapshot;
}

export interface OnlineRaceControllerConfig {
  seed: number;
  difficulty: Difficulty;
  playerId: 0 | 1;
  playerName: string;
  round?: number;
  snapshotIntervalTicks: number;
  options?: OnlineMechanismOptions;
  now?: () => number;
  sendSnapshot: (snapshot: RaceSnapshot) => Promise<void>;
}

export function serializeRaceSnapshot(
  playerId: 0 | 1,
  name: string,
  sentAt: number,
  state: GameStateSnapshot,
  round = 0,
  sequence = state.ticks
): RaceSnapshot {
  const detachedState: GameStateSnapshot = {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    platforms: state.platforms.map((platform) => ({ ...platform }))
  };
  return {
    playerId,
    name,
    round,
    sequence,
    sentAt,
    finishedFloor: state.floor,
    ...(state.mode === "gameover" ? { finishedAt: sentAt } : {}),
    state: detachedState
  };
}

export class OnlineRaceController {
  private readonly game: GameSimulation;
  private readonly now: () => number;
  private startedAt: number | null = null;
  private latestRemote: RaceSnapshot | null = null;
  private previousRemote: RaceSnapshot | null = null;
  private previousRemoteReceivedAt: number | null = null;
  private remoteReceivedAt: number | null = null;
  private lastPublishedTick = -1;
  private lastPublishedMode: GameStateSnapshot["mode"] = "playing";
  private lastPublishedAt: number | null = null;
  private nextSequence = 0;
  private averageArrivalMs = MIN_REMOTE_RENDER_DELAY_MS;
  private arrivalJitterMs = 0;
  private renderDelayMs = MIN_REMOTE_RENDER_DELAY_MS;

  constructor(private readonly config: OnlineRaceControllerConfig) {
    this.game = new GameSimulation({
      seed: config.seed,
      difficulty: config.difficulty,
      players: 1
    });
    if (config.options) this.game.setOptions(config.options);
    this.now = config.now ?? Date.now;
  }

  beginPlaying(): void {
    if (this.startedAt !== null) return;
    this.startedAt = this.now();
    void this.publish(this.game.snapshot());
  }

  step(input: InputFrame): void {
    this.beginPlaying();
    if (this.game.snapshot().mode !== "gameover") {
      this.game.step({
        players: [input.players[0], { left: false, right: false }],
        pausePressed: input.pausePressed
      }, STEP_MS);
    }
    const state = this.game.snapshot();
    const scheduled = state.ticks > 0 &&
      state.ticks !== this.lastPublishedTick &&
      state.ticks % this.config.snapshotIntervalTicks === 0;
    const modeChanged = state.mode !== this.lastPublishedMode;
    if (scheduled || modeChanged) {
      this.lastPublishedTick = state.ticks;
      this.lastPublishedMode = state.mode;
      void this.publish(state);
    }
    this.heartbeat();
  }

  heartbeat(): void {
    if (this.startedAt === null) return;
    const now = this.now();
    if (this.lastPublishedAt !== null && now - this.lastPublishedAt < RACE_HEARTBEAT_MS) return;
    void this.publish(this.game.snapshot());
  }

  private publish(state: GameStateSnapshot): Promise<void> {
    this.lastPublishedAt = this.now();
    return this.config.sendSnapshot(serializeRaceSnapshot(
      this.config.playerId,
      this.config.playerName,
      this.now(),
      state,
      this.config.round ?? 0,
      this.nextSequence++
    ));
  }

  receiveSnapshot(snapshot: RaceSnapshot): boolean {
    if (snapshot.playerId === this.config.playerId) return false;
    if (snapshot.round !== (this.config.round ?? 0)) return false;
    if (this.latestRemote && snapshot.sequence <= this.latestRemote.sequence) return false;
    const receivedAt = this.now();
    if (this.remoteReceivedAt !== null) {
      const interval = Math.max(0, receivedAt - this.remoteReceivedAt);
      const delta = Math.abs(interval - this.averageArrivalMs);
      this.averageArrivalMs += (interval - this.averageArrivalMs) * 0.25;
      this.arrivalJitterMs += (delta - this.arrivalJitterMs) * 0.25;
      this.renderDelayMs = Math.max(MIN_REMOTE_RENDER_DELAY_MS, Math.min(
        MAX_REMOTE_RENDER_DELAY_MS,
        this.averageArrivalMs + this.arrivalJitterMs * 2
      ));
    }
    this.previousRemote = this.latestRemote;
    this.previousRemoteReceivedAt = this.remoteReceivedAt;
    this.latestRemote = {
      ...snapshot,
      state: {
        ...snapshot.state,
        players: snapshot.state.players.map((player) => ({ ...player })),
        platforms: snapshot.state.platforms.map((platform) => ({ ...platform }))
      }
    };
    this.remoteReceivedAt = receivedAt;
    return true;
  }

  localSnapshot(): GameStateSnapshot {
    return this.game.snapshot();
  }

  remoteSnapshot(): GameStateSnapshot | null {
    if (!this.latestRemote) return null;
    return {
      ...this.latestRemote.state,
      players: this.latestRemote.state.players.map((player) => ({ ...player })),
      platforms: this.latestRemote.state.platforms.map((platform) => ({ ...platform }))
    };
  }

  remoteIdentity(): { playerId: 0 | 1; name: string } | null {
    return this.latestRemote
      ? { playerId: this.latestRemote.playerId, name: this.latestRemote.name }
      : null;
  }

  remoteRenderSnapshot(): GameStateSnapshot | null {
    if (!this.latestRemote) return null;
    if (!this.previousRemote || this.previousRemoteReceivedAt === null ||
        this.remoteReceivedAt === null) {
      return cloneGameState(this.latestRemote.state);
    }
    const span = this.remoteReceivedAt - this.previousRemoteReceivedAt;
    if (span <= 0) return cloneGameState(this.latestRemote.state);
    const targetTime = this.now() - this.renderDelayMs;
    const amount = Math.max(0, Math.min(1,
      (targetTime - this.previousRemoteReceivedAt) / span
    ));
    return interpolateGameState(
      this.previousRemote.state,
      this.latestRemote.state,
      amount
    );
  }

  drainEvents(): ReturnType<GameSimulation["drainEvents"]> {
    return this.game.drainEvents();
  }

  status(): {
    remoteAgeMs: number | null;
    localFinished: boolean;
    remoteFinished: boolean;
    renderDelayMs: number;
  } {
    const remoteAgeMs = this.startedAt === null
      ? 0
      : this.now() - (this.remoteReceivedAt ?? this.startedAt);
    return {
      remoteAgeMs,
      localFinished: this.game.snapshot().mode === "gameover",
      remoteFinished: this.latestRemote?.state.mode === "gameover",
      renderDelayMs: this.renderDelayMs
    };
  }
}

function cloneGameState(state: GameStateSnapshot): GameStateSnapshot {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    platforms: state.platforms.map((platform) => ({ ...platform }))
  };
}

function interpolate(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function interpolateGameState(
  previous: GameStateSnapshot,
  latest: GameStateSnapshot,
  amount: number
): GameStateSnapshot {
  const previousPlayers = new Map(previous.players.map((player) => [player.id, player]));
  const previousPlatforms = new Map(previous.platforms.map((platform) => [platform.id, platform]));
  return {
    ...latest,
    timeMs: interpolate(previous.timeMs, latest.timeMs, amount),
    cameraY: interpolate(previous.cameraY, latest.cameraY, amount),
    players: latest.players.map((player) => {
      const prior = previousPlayers.get(player.id);
      return prior ? {
        ...player,
        x: interpolate(prior.x, player.x, amount),
        y: interpolate(prior.y, player.y, amount),
        vx: interpolate(prior.vx, player.vx, amount),
        vy: interpolate(prior.vy, player.vy, amount)
      } : { ...player };
    }),
    platforms: latest.platforms.map((platform) => {
      const prior = previousPlatforms.get(platform.id);
      return prior ? {
        ...platform,
        y: interpolate(prior.y, platform.y, amount)
      } : { ...platform };
    })
  };
}
