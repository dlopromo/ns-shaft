import { SPRITE_ATLAS, type SpriteDefinition } from "./atlas";
import { GAME_LAYOUT } from "./layout";
import type { GameStateSnapshot, PlatformState, PlayerState } from "./types";

export const LOGICAL_WIDTH = GAME_LAYOUT.frame.width;
export const LOGICAL_HEIGHT = GAME_LAYOUT.frame.height;

export function springFrameIndex(ageMs: number): number {
  if (ageMs < 200) return Math.min(6, Math.floor(ageMs / (200 / 7)));
  return Math.max(0, 5 - Math.floor((ageMs - 200) / (100 / 6)));
}

export function rotatingFrameIndex(ageMs: number): number {
  if (ageMs >= 300) return 0;
  const step = Math.floor(Math.max(0, ageMs) / (300 / 6)) + 1;
  return step < 6 ? step : 0;
}

export function playerNeedsMirror(facing: PlayerState["facing"]): boolean {
  return facing === "right";
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private main = new Image();
  private native = new Image();
  private background = new Image();
  private frame = new Image();
  private lastState: GameStateSnapshot | null = null;
  private fast = false;
  private recordFloor = 0;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;
    for (const image of [this.main, this.native, this.background, this.frame]) {
      image.addEventListener("load", () => {
        if (this.lastState) this.render(this.lastState);
      });
    }
    this.main.src = SPRITE_ATLAS.image;
    this.native.src = SPRITE_ATLAS.nativeImage;
    this.background.src = `${import.meta.env.BASE_URL}assets/web/rt_bitmap-102-1041.png`;
    this.frame.src = `${import.meta.env.BASE_URL}assets/web/rt_bitmap-106-1041.png`;
  }

  configure(options: { fast: boolean; recordFloor?: number }): void {
    this.fast = options.fast;
    if (options.recordFloor !== undefined) this.recordFloor = options.recordFloor;
    if (this.lastState) this.render(this.lastState);
  }

  render(state: GameStateSnapshot): void {
    this.lastState = state;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    if (this.frame.complete) this.ctx.drawImage(this.frame, 0, 0);

    const viewport = GAME_LAYOUT.playfield;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    this.ctx.clip();
    this.ctx.translate(viewport.x, viewport.y);
    this.drawBackground(state.cameraY);
    for (const platform of state.platforms) this.drawPlatform(platform);
    for (const player of state.players) this.drawPlayer(player, state.timeMs);
    this.drawWalls();
    this.drawCeiling();
    if (state.mode === "paused") {
      this.drawSprite(SPRITE_ATLAS.pause, (viewport.width - 128) / 2, 150);
    }
    if (state.mode === "gameover" || state.mode === "name-entry") {
      this.drawSprite(SPRITE_ATLAS.gameOver, (viewport.width - 96) / 2, 168);
    }
    this.ctx.restore();

    this.drawHud(state);
    this.drawSidebar(state);
  }

  private drawBackground(cameraY: number): void {
    const { width, height } = GAME_LAYOUT.playfield;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, width, height);
    if (this.fast || !this.background.complete) return;
    const offset = ((Math.floor(cameraY) % 128) + 128) % 128;
    for (let y = -offset; y < height; y += 128) {
      for (let x = 0; x < width; x += 128) {
        this.ctx.drawImage(this.background, x, y);
      }
    }
  }

  private drawPlayer(player: PlayerState, timeMs: number): void {
    if (!this.native.complete) return;
    if (player.hurtUntilMs > timeMs && Math.floor(timeMs / 100) % 2 === 1) return;
    const hurt = player.hurtUntilMs > timeMs;
    const frames = hurt
      ? SPRITE_ATLAS.hurtPlayers[player.color]
      : SPRITE_ATLAS.players[player.color];
    const animation = player.pose === "dead" ? "dead" :
      player.pose === "hurt" ? "side" :
      player.pose === "jump" || player.pose === "fall" ? "jump" :
      player.pose === "walk" ? "walk" : "stand";
    const sequence = SPRITE_ATLAS.playerAnimations[animation];
    const sprite = frames[sequence[Math.floor(timeMs / 80) % sequence.length]];
    const x = Math.round(player.x - sprite.anchor.x);
    const y = Math.round(player.y - sprite.anchor.y);
    this.ctx.save();
    if (playerNeedsMirror(player.facing)) {
      this.ctx.translate(Math.round(player.x) * 2, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(
      this.native,
      sprite.x, sprite.y, sprite.width, sprite.height,
      x, y, sprite.width, sprite.height
    );
    this.ctx.restore();
  }

  private drawPlatform(platform: PlatformState): void {
    if (!this.main.complete || platform.activationState === "gone") return;
    const source = this.platformFrame(platform);
    const drawY = platform.variant === "spring" || platform.variant === "spike"
      ? Math.round(platform.y - (source.height - 12))
      : Math.round(platform.y);
    this.drawSprite(source, Math.round(platform.x), drawY);
  }

  private platformFrame(platform: PlatformState): SpriteDefinition {
    if (platform.variant.startsWith("conveyor")) {
      const frames = platform.variant === "conveyor-left"
        ? SPRITE_ATLAS.platformAnimations.conveyorLeft
        : SPRITE_ATLAS.platformAnimations.conveyorRight;
      return frames[Math.floor(platform.ageMs / 60) % frames.length];
    }
    if (platform.variant === "disappearing") {
      const frames = SPRITE_ATLAS.platformAnimations.rotating;
      if (platform.activationState !== "disappearing") return frames[0];
      return frames[rotatingFrameIndex(
        platform.activationAgeMs - 200
      )];
    }
    if (platform.variant === "spring") {
      const frames = SPRITE_ATLAS.platformAnimations.spring;
      if (platform.activationState === "active") return frames[0];
      return frames[springFrameIndex(platform.activationAgeMs)];
    }
    if (platform.variant === "spike") return SPRITE_ATLAS.platformAnimations.spike[0];
    return SPRITE_ATLAS.platforms.normal;
  }

  private drawWalls(): void {
    if (!this.main.complete) return;
    const rightX = GAME_LAYOUT.playfield.width - SPRITE_ATLAS.wall.width - 4;
    for (let y = 0; y < GAME_LAYOUT.playfield.height; y += SPRITE_ATLAS.wall.height) {
      this.drawSprite(SPRITE_ATLAS.wall, 0, y);
      this.drawSprite(SPRITE_ATLAS.wall, rightX, y);
    }
  }

  private drawCeiling(): void {
    if (!this.main.complete) return;
    this.drawSprite(SPRITE_ATLAS.ceiling, SPRITE_ATLAS.wall.width, 0);
  }

  private drawHud(state: GameStateSnapshot): void {
    if (!this.native.complete) return;
    const layout = GAME_LAYOUT.hud;
    this.drawSpriteAt(SPRITE_ATLAS.lifeLabel, layout.lifeLabel.x, layout.lifeLabel.y);
    const maxHealth = SPRITE_ATLAS.lifeBars.length - 1;
    const health = Math.max(0, Math.min(maxHealth, state.players[0]?.health ?? 0));
    this.drawSpriteAt(SPRITE_ATLAS.lifeBars[health], layout.lifeBar.x, layout.lifeBar.y);
    for (let index = 0; index < SPRITE_ATLAS.floorPrefixParts.length; index += 1) {
      this.drawSpriteAt(
        SPRITE_ATLAS.floorPrefixParts[index],
        layout.floorPrefix.x + index * 38,
        layout.floorPrefix.y
      );
    }
    const value = String(state.floor).padStart(4, "0").slice(-4);
    for (let index = 0; index < value.length; index += 1) {
      this.drawSpriteAt(
        SPRITE_ATLAS.digits[Number(value[index])],
        layout.floorDigits.x + index * layout.floorDigits.step,
        layout.floorDigits.y
      );
    }
    this.drawSpriteAt(SPRITE_ATLAS.floorSuffix, layout.floorSuffix.x, layout.floorSuffix.y);
  }

  private drawSidebar(state: GameStateSnapshot): void {
    if (!this.native.complete) return;
    const difficultyIndex = { easy: 0, normal: 1, hard: 2 }[state.difficulty];
    const difficulty = GAME_LAYOUT.sidebar.difficultyValue;
    const difficultySprite = SPRITE_ATLAS.difficultyLabels[difficultyIndex];
    this.drawSpriteAt(
      difficultySprite,
      difficulty.right - difficultySprite.width,
      difficulty.y
    );

    const record = String(this.recordFloor).padStart(4, "0").slice(-4);
    const layout = GAME_LAYOUT.sidebar.recordDigits;
    for (let index = 0; index < record.length; index += 1) {
      const digit = SPRITE_ATLAS.smallDigits[Number(record[index])];
      this.drawSpriteAt(
        digit,
        layout.x + index * layout.step,
        layout.baselineY - digit.height
      );
    }
  }

  private drawSprite(
    sprite: SpriteDefinition,
    x: number,
    y: number,
    width = sprite.width,
    height = sprite.height
  ): void {
    const image = sprite.source === "native" ? this.native : this.main;
    this.ctx.drawImage(
      image,
      sprite.x, sprite.y, sprite.width, sprite.height,
      x, y, width, height
    );
  }

  private drawSpriteAt(
    sprite: SpriteDefinition,
    x: number,
    y: number,
    width = sprite.width,
    height = sprite.height
  ): void {
    this.drawSprite(sprite, x, y, width, height);
  }
}
