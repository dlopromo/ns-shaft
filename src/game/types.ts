export type Difficulty = "easy" | "normal" | "hard";
export type Locale = "ja" | "zh-Hant" | "en";
export type PlatformKind = "normal" | "spike" | "conveyor" | "spring" | "rotating";
export type PlatformVariant =
  | "normal" | "spike" | "conveyor-left" | "conveyor-right"
  | "spring" | "disappearing";
export type PlatformActivationState = "active" | "triggered" | "disappearing" | "gone";
export type GameMode = "title" | "playing" | "paused" | "records" | "gameover";
export type PlayerPose = "stand" | "walk" | "jump" | "fall" | "hurt" | "dead";
export type GameEventType =
  | "land" | "heal" | "hurt" | "spring" | "conveyor"
  | "rotate" | "ceiling" | "death" | "pause" | "abort";

export interface PlayerInput {
  left: boolean;
  right: boolean;
}

export interface InputFrame {
  players: [PlayerInput, PlayerInput];
  pausePressed: boolean;
}

export interface PlayerState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  health: number;
  alive: boolean;
  color: "yellow" | "green";
  pose: PlayerPose;
  facing: "left" | "right";
  invulnerableTicks: number;
  standingPlatformId: number | null;
  standingPlayerId: number | null;
  onPlatformSince: number | null;
  springIgnoredPlatformIds: number[];
  springSourcePlatformId: number | null;
  springLaunchAtMs: number | null;
  springLaunchPlatformId: number | null;
  hurtUntilTick: number;
  hurtUntilMs: number;
}

export interface PlatformState {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  variant: PlatformVariant;
  direction: -1 | 1;
  phase: number;
  collidable: boolean;
  ageTicks: number;
  height: number;
  conveyorVelocity: number;
  activationState: PlatformActivationState;
  ageMs: number;
  activationAgeMs: number;
  sequence: number;
}

export interface DifficultyProfile {
  basePlatformVelocity: number;
  platformGap: number;
  weights: Record<PlatformVariant, number>;
}

export interface GameStateSnapshot {
  mode: GameMode;
  difficulty: Difficulty;
  floor: number;
  floorSequence: number;
  level: number;
  timeMs: number;
  cameraY: number;
  ticks: number;
  players: PlayerState[];
  platforms: PlatformState[];
}

export interface SimulationCheckpoint {
  state: GameStateSnapshot;
  randomState: number;
  nextPlatformId: number;
  nextFloorSequence: number;
  options: {
    conveyor: boolean;
    spring: boolean;
    rotating: boolean;
    fast: boolean;
  };
}

export interface GameEvent {
  type: GameEventType;
  playerId?: number;
  platformId?: number;
  platformKind?: PlatformKind;
}

export interface SaveData {
  version: 3;
  settings: {
    difficulty: Difficulty;
    music: boolean;
    sound: boolean;
    fast: boolean;
    conveyor: boolean;
    spring: boolean;
    rotating: boolean;
    locale: Locale;
  };
  lastInputName: string;
  playerNames: [string, string];
}
