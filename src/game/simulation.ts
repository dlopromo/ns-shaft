import { DIFFICULTIES } from "./difficulty";
import { GAME_LAYOUT } from "./layout";
import { SeededRandom } from "./random";
import type {
  Difficulty, GameEvent, GameStateSnapshot, InputFrame, PlatformKind,
  PlatformState, PlatformVariant, PlayerState
} from "./types";

export const IPEL_PHYSICS = {
  maxSubstepMs: 20,
  gravity: 0.0015,
  controlVelocity: 0.2,
  conveyorVelocity: 0.1,
  springVelocity: -0.5,
  springCompressionMs: 100,
  disappearingHoldMs: 150,
  disappearingTurnMs: 240,
  platformGap: 60,
  platformCollisionHeight: 12,
  playerCollisionSize: 26,
  maxHealth: 12,
  platformWidth: 96,
  spikeDamage: 5,
  ceilingDamage: 5,
  hurtBlinkMs: 1000
} as const;

const WIDTH = GAME_LAYOUT.playfield.width;
const HEIGHT = GAME_LAYOUT.playfield.height;
const PLAYABLE_LEFT = GAME_LAYOUT.playable.x;
const PLAYABLE_RIGHT = GAME_LAYOUT.playable.x + GAME_LAYOUT.playable.width;
const PLAYER_RENDER_HALF_WIDTH = 16;
const SPRING_LAUNCH_MS = IPEL_PHYSICS.springCompressionMs * 2;
const ROTATING_CYCLE_MS =
  IPEL_PHYSICS.disappearingHoldMs + IPEL_PHYSICS.disappearingTurnMs;
const THREE_ROW_REACH_MS = 500;
const THREE_ROW_REACH_CENTER_DELTA =
  IPEL_PHYSICS.platformWidth / 2 +
  IPEL_PHYSICS.playerCollisionSize / 2 +
  IPEL_PHYSICS.controlVelocity * THREE_ROW_REACH_MS;

const kindForVariant = (variant: PlatformVariant): PlatformKind => {
  if (variant === "spike") return "spike";
  if (variant === "spring") return "spring";
  if (variant.startsWith("conveyor")) return "conveyor";
  if (variant === "disappearing") return "rotating";
  return "normal";
};

type DebugPlatform = Pick<
  PlatformState,
  "id" | "x" | "y" | "width" | "kind" | "direction" | "phase" | "collidable"
> & Partial<Omit<
  PlatformState,
  "id" | "x" | "y" | "width" | "kind" | "direction" | "phase" | "collidable"
>>;

export class GameSimulation {
  private readonly random: SeededRandom;
  private state: GameStateSnapshot;
  private nextPlatformId = 1;
  private nextFloorSequence = 1;
  private events: GameEvent[] = [];
  private options = { conveyor: true, spring: true, rotating: true, fast: false };
  private readonly FAST_MULTIPLIER = 2;

  constructor(config: { seed: number; difficulty: Difficulty; players: 1 | 2 }) {
    this.random = new SeededRandom(config.seed);
    const players: PlayerState[] = Array.from({ length: config.players }, (_, id) => ({
      id,
      x: PLAYABLE_LEFT + GAME_LAYOUT.playable.width / 2 + (id === 0 ? -14 : 14),
      y: HEIGHT - 30,
      vx: 0,
      vy: 0,
      width: IPEL_PHYSICS.playerCollisionSize,
      height: IPEL_PHYSICS.playerCollisionSize,
      health: IPEL_PHYSICS.maxHealth,
      alive: true,
      color: id === 0 ? "yellow" : "green",
      pose: "fall",
      facing: "right",
      invulnerableTicks: 0,
      standingPlatformId: null,
      standingPlayerId: null,
      onPlatformSince: null,
      springIgnoreAboveY: null,
      hurtUntilTick: 0,
      hurtUntilMs: 0
    }));
    this.state = {
      mode: "playing",
      difficulty: config.difficulty,
      floor: 0,
      floorSequence: 0,
      level: 0,
      timeMs: 0,
      cameraY: 0,
      ticks: 0,
      players,
      platforms: []
    };
    this.seedInitialPlatforms();
  }

  snapshot(): GameStateSnapshot {
    return structuredClone(this.state);
  }

  setOptions(options: Partial<typeof this.options>): void {
    this.options = { ...this.options, ...options };
    if (this.state.timeMs !== 0) return;
    for (const platform of this.state.platforms) {
      const disabled =
        (platform.variant === "disappearing" && !this.options.rotating) ||
        (platform.variant === "spring" && !this.options.spring) ||
        (platform.variant.startsWith("conveyor") && !this.options.conveyor);
      if (disabled) this.applyVariant(platform, "normal");
    }
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  step(input: InputFrame, elapsedMs: number = IPEL_PHYSICS.maxSubstepMs): void {
    if (input.pausePressed) {
      this.state.mode = this.state.mode === "paused" ? "playing" : "paused";
      this.events.push({ type: "pause" });
    }
    if (this.state.mode !== "playing" || elapsedMs <= 0) return;
    let remaining = elapsedMs;
    while (remaining > 0 && this.state.mode === "playing") {
      const stepMs = Math.min(IPEL_PHYSICS.maxSubstepMs, remaining);
      this.updateStep(input, stepMs);
      remaining -= stepMs;
    }
  }

  private updateStep(input: InputFrame, stepMs: number): void {
    this.state.timeMs += stepMs;
    this.state.ticks += 1;
    const velocity = this.platformVelocity();
    const platformStepMs = this.options.fast ? stepMs * this.FAST_MULTIPLIER : stepMs;
    this.updatePlatforms(stepMs, platformStepMs, velocity);
    this.state.platforms = this.state.platforms.filter((platform) =>
      platform.y + IPEL_PHYSICS.platformCollisionHeight >= 0
    );
    this.fillPlatforms();
    const previousPlayers = this.state.players.map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y
    }));
    for (const player of this.state.players) {
      this.updatePlayer(player, input.players[player.id], stepMs, velocity);
    }
    this.resolvePlayerOverlaps(previousPlayers);
    this.state.cameraY += -velocity * stepMs;
    if (!this.state.players.some((player) => player.alive)) this.state.mode = "gameover";
  }

  private platformVelocity(): number {
    const profile = DIFFICULTIES[this.state.difficulty];
    const base = profile.basePlatformVelocity * (1 + this.state.level * 0.1);
    return this.options.fast ? base * this.FAST_MULTIPLIER : base;
  }

  private updatePlatforms(moveStepMs: number, timerStepMs: number, velocity: number): void {
    for (const platform of this.state.platforms) {
      platform.y += velocity * moveStepMs;
      platform.ageMs += timerStepMs;
      platform.ageTicks += 1;
      platform.phase = (platform.phase + timerStepMs / 1000) % 1;
      if (platform.activationState !== "active") platform.activationAgeMs += timerStepMs;

      if (platform.variant === "disappearing" && platform.activationState !== "active") {
        if (platform.activationAgeMs < IPEL_PHYSICS.disappearingHoldMs) {
          platform.activationState = "triggered";
          platform.collidable = true;
          platform.height = IPEL_PHYSICS.platformCollisionHeight;
        } else if (platform.activationAgeMs < ROTATING_CYCLE_MS) {
          platform.activationState = "disappearing";
          platform.collidable = false;
          platform.height = 0;
        } else {
          platform.activationState = "active";
          platform.activationAgeMs = 0;
          platform.collidable = true;
          platform.height = IPEL_PHYSICS.platformCollisionHeight;
        }
      }

      if (platform.variant === "spring" &&
          platform.activationState === "triggered" &&
          platform.activationAgeMs >= SPRING_LAUNCH_MS + IPEL_PHYSICS.springCompressionMs) {
        platform.activationState = "active";
        platform.activationAgeMs = 0;
      }
    }
  }

  private updatePlayer(
    player: PlayerState,
    input: { left: boolean; right: boolean },
    stepMs: number,
    platformVelocity: number
  ): void {
    if (!player.alive) {
      this.updateDeadPlayer(player, stepMs);
      return;
    }
    if (player.health <= 0) {
      this.killPlayer(player);
      this.updateDeadPlayer(player, stepMs);
      return;
    }
    const direction = Number(input.right) - Number(input.left);
    if (direction !== 0) player.facing = direction < 0 ? "left" : "right";
    const control = direction * IPEL_PHYSICS.controlVelocity;
    if (player.springIgnoreAboveY !== null &&
        player.vy >= 0 &&
        player.y >= player.springIgnoreAboveY) {
      player.springIgnoreAboveY = null;
    }

    const standing = player.standingPlatformId === null ? undefined :
      this.state.platforms.find((platform) => platform.id === player.standingPlatformId);
    const standingPlayer = player.standingPlayerId === null ? undefined :
      this.state.players.find((other) => other.id === player.standingPlayerId && other.alive);
    player.vx = standing?.variant.startsWith("conveyor")
      ? standing.conveyorVelocity
      : 0;
    player.x = this.clampPlayerX(player.x + (player.vx + control) * stepMs);
    if (standingPlayer && this.playerOverlapsPlayerHorizontally(player, standingPlayer)) {
      player.y = standingPlayer.y - standingPlayer.height;
      player.vy = standingPlayer.vy;
      player.pose = direction === 0 ? "stand" : "walk";
      this.resolveCeiling(player);
      return;
    } else if (player.standingPlayerId !== null) {
      player.standingPlayerId = null;
      player.onPlatformSince = null;
    }
    if (standing?.collidable && this.playerOverlapsPlatform(player, standing)) {
      player.y = standing.y;
      player.vy = platformVelocity;
      player.pose = direction === 0 ? "stand" : "walk";
      if (standing.variant === "disappearing" && standing.activationState === "active") {
        this.triggerPlatform(standing);
      }
      if (standing.variant === "spring") {
        if (standing.activationState === "active") this.triggerPlatform(standing);
        if (standing.activationAgeMs >= SPRING_LAUNCH_MS) {
          player.standingPlatformId = null;
          player.standingPlayerId = null;
          player.onPlatformSince = null;
          player.vy = IPEL_PHYSICS.springVelocity;
          player.springIgnoreAboveY = standing.y;
          this.events.push({ type: "spring", playerId: player.id, platformId: standing.id });
        } else {
          this.resolveCeiling(player);
          return;
        }
      } else if (player.standingPlatformId !== null) {
        this.resolveCeiling(player);
        return;
      }
    } else if (player.standingPlatformId !== null) {
      player.vx = 0;
      player.standingPlatformId = null;
      player.standingPlayerId = null;
      player.onPlatformSince = null;
    }

    const previousFoot = player.y;
    const distance = player.vy * stepMs +
      0.5 * IPEL_PHYSICS.gravity * stepMs * stepMs;
    const newFoot = player.y + distance;
    const playerLanding = player.vy >= 0
      ? this.findPlayerLanding(player, previousFoot, newFoot)
      : undefined;
    const landing = !playerLanding && player.vy >= 0
      ? this.findLanding(player, previousFoot, newFoot, platformVelocity, stepMs)
      : undefined;
    if (playerLanding) {
      player.y = playerLanding.y - playerLanding.height;
      player.vy = playerLanding.vy;
      player.standingPlayerId = playerLanding.id;
      player.standingPlatformId = null;
      player.onPlatformSince = this.state.timeMs;
      player.pose = "stand";
    } else if (landing) {
      player.y = landing.y;
      this.land(player, landing, platformVelocity);
    } else {
      player.y = newFoot;
      player.vy += IPEL_PHYSICS.gravity * stepMs;
      player.pose = player.vy < 0 ? "jump" : "fall";
    }

    this.resolveCeiling(player);
    if (player.y > HEIGHT + player.height) this.killPlayer(player);
  }

  private killPlayer(player: PlayerState): void {
    if (!player.alive) return;
    player.alive = false;
    player.pose = "dead";
    player.standingPlatformId = null;
    player.standingPlayerId = null;
    player.springIgnoreAboveY = null;
    this.events.push({ type: "death", playerId: player.id });
  }

  private updateDeadPlayer(player: PlayerState, stepMs: number): void {
    if (player.y > HEIGHT + player.height) return;
    player.y += player.vy * stepMs +
      0.5 * IPEL_PHYSICS.gravity * stepMs * stepMs;
    player.vy += IPEL_PHYSICS.gravity * stepMs;
    player.pose = "dead";
  }

  private findPlayerLanding(
    player: PlayerState,
    previousFoot: number,
    newFoot: number
  ): PlayerState | undefined {
    return this.state.players.find((other) =>
      other.id !== player.id &&
      other.alive &&
      this.playerOverlapsPlayerHorizontally(player, other) &&
      previousFoot <= other.y - other.height &&
      newFoot >= other.y - other.height
    );
  }

  private findLanding(
    player: PlayerState,
    previousFoot: number,
    newFoot: number,
    platformVelocity: number,
    stepMs: number
  ): PlatformState | undefined {
    return this.state.platforms.find((platform) =>
      platform.collidable &&
      (player.springIgnoreAboveY === null || platform.y >= player.springIgnoreAboveY || platform.variant === "spring") &&
      this.playerOverlapsPlatform(player, platform) &&
      previousFoot <= platform.y - platformVelocity * stepMs &&
      newFoot >= platform.y
    );
  }

  private land(player: PlayerState, platform: PlatformState, velocity: number): void {
    player.vy = velocity;
    player.standingPlatformId = platform.id;
    player.standingPlayerId = null;
    player.springIgnoreAboveY = null;
    player.onPlatformSince = this.state.timeMs;
    if (platform.variant === "disappearing" || platform.variant === "spring") {
      this.triggerPlatform(platform);
    }
    if (platform.variant.startsWith("conveyor")) {
      this.events.push({ type: "conveyor", playerId: player.id, platformId: platform.id });
    }
    player.vx = platform.variant.startsWith("conveyor")
      ? platform.conveyorVelocity
      : 0;
    this.resolveLanding(player, platform.kind);
    this.updateFloor(platform.sequence);
  }

  private triggerPlatform(platform: PlatformState): void {
    if (platform.activationState !== "active") return;
    platform.activationState = "triggered";
    platform.activationAgeMs = 0;
    platform.ageTicks = 0;
    if (platform.variant === "disappearing") {
      this.events.push({ type: "rotate", platformId: platform.id });
    }
  }

  private resolveCeiling(player: PlayerState): void {
    if (player.y - player.height >= 0) return;
    player.y = player.height;
    player.vy = 0;
    if (player.standingPlatformId !== null) {
      const platform = this.state.platforms.find((item) => item.id === player.standingPlatformId);
      if (platform?.variant.startsWith("conveyor")) player.vx = 0;
      player.standingPlatformId = null;
      player.standingPlayerId = null;
      player.onPlatformSince = null;
      player.springIgnoreAboveY = null;
    }
    player.health = Math.max(0, player.health - IPEL_PHYSICS.ceilingDamage);
    player.hurtUntilMs = this.state.timeMs + IPEL_PHYSICS.hurtBlinkMs;
    player.pose = "hurt";
    this.events.push({ type: "ceiling", playerId: player.id });
  }

  private resolveLanding(player: PlayerState, kind: PlatformKind): void {
    this.events.push({ type: "land", playerId: player.id, platformKind: kind });
    if (kind === "spike") {
      player.health = Math.max(0, player.health - IPEL_PHYSICS.spikeDamage);
      player.hurtUntilMs = this.state.timeMs + IPEL_PHYSICS.hurtBlinkMs;
      player.pose = "hurt";
      this.events.push({ type: "hurt", playerId: player.id, platformKind: kind });
      return;
    }
    const before = player.health;
    player.health = Math.min(IPEL_PHYSICS.maxHealth, player.health + 1);
    if (player.health > before) this.events.push({ type: "heal", playerId: player.id });
  }

  private updateFloor(sequence: number): void {
    this.state.floorSequence = Math.max(this.state.floorSequence, sequence);
    const floor = Math.floor(this.state.floorSequence * 0.2);
    if (floor <= this.state.floor) return;
    this.state.floor = floor;
    this.state.level = Math.floor(floor * 0.1) + 1;
  }

  private seedInitialPlatforms(): void {
    const startY = HEIGHT - IPEL_PHYSICS.platformCollisionHeight;
    const initial: PlatformState[] = [];
    const rows: number[] = [];
    for (let y = startY; y >= 0; y -= IPEL_PHYSICS.platformGap) rows.unshift(y);
    for (const y of rows) {
      initial.push(this.createPlatform(
        y === startY ? "normal" : this.pickVariant(),
        y === startY
          ? PLAYABLE_LEFT + (GAME_LAYOUT.playable.width - IPEL_PHYSICS.platformWidth) / 2
          : this.randomPlatformX(initial.slice(-1)),
        y,
        0
      ));
    }
    initial.push(this.createPlatform(
      this.pickVariant(),
      this.randomPlatformX(initial.slice(-3)),
      startY + IPEL_PHYSICS.platformGap,
      this.nextFloorSequence++
    ));
    this.state.platforms = initial;
  }

  private fillPlatforms(): void {
    if (this.state.platforms.length === 0) {
      this.state.platforms.push(this.createPlatform(
        "normal",
        PLAYABLE_LEFT + (GAME_LAYOUT.playable.width - IPEL_PHYSICS.platformWidth) / 2,
        HEIGHT - IPEL_PHYSICS.platformCollisionHeight,
        this.nextFloorSequence++
      ));
    }
    let lowest = this.state.platforms.reduce((value, platform) =>
      platform.y > value.y ? platform : value
    );
    while (lowest.y + IPEL_PHYSICS.platformCollisionHeight < HEIGHT) {
      const anchors = this.state.platforms
        .slice()
        .sort((left, right) => right.y - left.y)
        .slice(0, 1);
      const next = this.createPlatform(
        this.pickVariant(),
        this.randomPlatformX(anchors),
        lowest.y + IPEL_PHYSICS.platformGap,
        this.nextFloorSequence++
      );
      this.state.platforms.push(next);
      lowest = next;
    }
  }

  private randomPlatformX(anchors: PlatformState[] = []): number {
    const x = PLAYABLE_LEFT + Math.round(
      this.random.next() * (GAME_LAYOUT.playable.width - IPEL_PHYSICS.platformWidth)
    );
    return this.snapPlatformXToPlayableWall(this.keepPlatformReachable(x, anchors), anchors);
  }

  private keepPlatformReachable(x: number, anchors: PlatformState[]): number {
    if (anchors.length === 0) return x;
    const center = x + IPEL_PHYSICS.platformWidth / 2;
    if (this.platformXIsReachableFromAnchors(x, anchors)) {
      return x;
    }

    const anchor = anchors[Math.floor(this.random.next() * anchors.length)];
    const anchorCenter = anchor.x + anchor.width / 2;
    const direction = center < anchorCenter ? -1 : 1;
    const reachableCenter = anchorCenter + direction * THREE_ROW_REACH_CENTER_DELTA;
    const minimumX = PLAYABLE_LEFT;
    const maximumX = PLAYABLE_RIGHT - IPEL_PHYSICS.platformWidth;
    return Math.max(minimumX, Math.min(maximumX, Math.round(
      reachableCenter - IPEL_PHYSICS.platformWidth / 2
    )));
  }

  private snapPlatformXToPlayableWall(x: number, anchors: PlatformState[] = []): number {
    const right = x + IPEL_PHYSICS.platformWidth;
    const leftGap = x - PLAYABLE_LEFT;
    const rightGap = PLAYABLE_RIGHT - right;
    if (leftGap > 0 && leftGap < IPEL_PHYSICS.playerCollisionSize) {
      const openX = PLAYABLE_LEFT + IPEL_PHYSICS.playerCollisionSize;
      if (anchors.length > 0 &&
          !this.platformXIsReachableFromAnchors(PLAYABLE_LEFT, anchors) &&
          this.platformXIsReachableFromAnchors(openX, anchors)) {
        return openX;
      }
      return PLAYABLE_LEFT;
    }
    if (rightGap > 0 && rightGap < IPEL_PHYSICS.playerCollisionSize) {
      const openX = PLAYABLE_RIGHT - IPEL_PHYSICS.platformWidth -
        IPEL_PHYSICS.playerCollisionSize;
      const wallX = PLAYABLE_RIGHT - IPEL_PHYSICS.platformWidth;
      if (anchors.length > 0 &&
          !this.platformXIsReachableFromAnchors(wallX, anchors) &&
          this.platformXIsReachableFromAnchors(openX, anchors)) {
        return openX;
      }
      return PLAYABLE_RIGHT - IPEL_PHYSICS.platformWidth;
    }
    return x;
  }

  private platformXIsReachableFromAnchors(x: number, anchors: PlatformState[]): boolean {
    const center = x + IPEL_PHYSICS.platformWidth / 2;
    return anchors.some((platform) =>
      Math.abs(center - (platform.x + platform.width / 2)) <= THREE_ROW_REACH_CENTER_DELTA
    );
  }

  private pickVariant(): PlatformVariant {
    const weights = { ...DIFFICULTIES[this.state.difficulty].weights };
    if (!this.options.rotating) weights.disappearing = 0;
    if (!this.options.conveyor) {
      weights["conveyor-left"] = 0;
      weights["conveyor-right"] = 0;
    }
    if (!this.options.spring) weights.spring = 0;
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    let roll = this.random.next() * total;
    for (const [variant, weight] of Object.entries(weights) as [PlatformVariant, number][]) {
      roll -= weight;
      if (roll <= 0) return variant;
    }
    return "normal";
  }

  private createPlatform(
    variant: PlatformVariant,
    x: number,
    y: number,
    sequence: number
  ): PlatformState {
    const platform: PlatformState = {
      id: this.nextPlatformId++,
      x,
      y,
      width: IPEL_PHYSICS.platformWidth,
      kind: "normal",
      variant: "normal",
      direction: 1,
      phase: 0,
      collidable: true,
      ageTicks: 0,
      ageMs: 0,
      activationAgeMs: 0,
      height: IPEL_PHYSICS.platformCollisionHeight,
      conveyorVelocity: 0,
      activationState: "active",
      sequence
    };
    this.applyVariant(platform, variant);
    return platform;
  }

  private applyVariant(platform: PlatformState, variant: PlatformVariant): void {
    const direction: -1 | 1 = variant === "conveyor-left" ? -1 : 1;
    platform.kind = kindForVariant(variant);
    platform.variant = variant;
    platform.direction = direction;
    platform.conveyorVelocity = variant.startsWith("conveyor")
      ? direction * IPEL_PHYSICS.conveyorVelocity
      : 0;
    platform.collidable = true;
    platform.height = IPEL_PHYSICS.platformCollisionHeight;
    platform.activationState = "active";
    platform.activationAgeMs = 0;
  }

  private playerOverlapsPlatform(player: PlayerState, platform: PlatformState): boolean {
    const half = player.width / 2;
    return player.x + half > platform.x && player.x - half < platform.x + platform.width;
  }

  private playerOverlapsPlayerHorizontally(player: PlayerState, other: PlayerState): boolean {
    const half = player.width / 2;
    const otherHalf = other.width / 2;
    return player.x + half > other.x - otherHalf &&
      player.x - half < other.x + otherHalf;
  }

  private playerBoxesOverlap(first: PlayerState, second: PlayerState): boolean {
    const half = first.width / 2;
    const secondHalf = second.width / 2;
    return first.x + half > second.x - secondHalf &&
      first.x - half < second.x + secondHalf &&
      first.y > second.y - second.height &&
      first.y - first.height < second.y;
  }

  private resolvePlayerOverlaps(previousPlayers: { id: number; x: number; y: number }[]): void {
    for (let firstIndex = 0; firstIndex < this.state.players.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.state.players.length; secondIndex += 1) {
        const first = this.state.players[firstIndex];
        const second = this.state.players[secondIndex];
        if (!first.alive || !second.alive || !this.playerBoxesOverlap(first, second)) continue;
        const previousFirst = previousPlayers.find((player) => player.id === first.id);
        const previousSecond = previousPlayers.find((player) => player.id === second.id);
        const firstWasLeft = (previousFirst?.x ?? first.x) <= (previousSecond?.x ?? second.x);
        const left = firstWasLeft ? first : second;
        const right = firstWasLeft ? second : first;
        const distance = right.x - left.x;
        const minimum = Math.max(left.width, right.width);
        if (distance >= minimum) continue;
        const midpoint = (left.x + right.x) / 2;
        left.x = this.clampPlayerX(midpoint - minimum / 2);
        right.x = this.clampPlayerX(left.x + minimum);
        if (right.x - left.x < minimum) {
          right.x = this.clampPlayerX(midpoint + minimum / 2);
          left.x = this.clampPlayerX(right.x - minimum);
        }
      }
    }
  }

  private clampPlayerX(x: number): number {
    return Math.max(
      PLAYABLE_LEFT + PLAYER_RENDER_HALF_WIDTH,
      Math.min(PLAYABLE_RIGHT - PLAYER_RENDER_HALF_WIDTH, x)
    );
  }

  debugSetPlatforms(platforms: DebugPlatform[]): void {
    this.state.platforms = structuredClone(platforms).map((platform) => ({
      ...platform,
      variant: platform.variant ??
        (platform.kind === "rotating" ? "disappearing" :
          platform.kind === "conveyor" ? "conveyor-right" : platform.kind),
      ageTicks: platform.ageTicks ?? 0,
      ageMs: platform.ageMs ?? 0,
      activationAgeMs: platform.activationAgeMs ?? 0,
      height: platform.height ?? IPEL_PHYSICS.platformCollisionHeight,
      conveyorVelocity: platform.conveyorVelocity ??
        ((platform.variant ?? (platform.kind === "conveyor" ? "conveyor-right" : "normal"))
          .startsWith("conveyor")
          ? (platform.direction ?? 1) * IPEL_PHYSICS.conveyorVelocity
          : 0),
      activationState: platform.activationState ?? "active",
      sequence: platform.sequence ?? 0
    }));
  }

  debugSetPlayer(index: number, patch: Partial<PlayerState>): void {
    Object.assign(this.state.players[index], patch);
  }

  debugResolveLanding(index: number, kind: PlatformKind): void {
    this.resolveLanding(this.state.players[index], kind);
  }

  debugSetProgress(floorSequence: number): void {
    this.updateFloor(floorSequence);
  }
}
