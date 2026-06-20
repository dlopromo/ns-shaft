import type { InputFrame, PlayerInput } from "./types";

const EMPTY_PLAYER_INPUT: PlayerInput = { left: false, right: false };

export type TouchDirection = "left" | "right";

export class KeyboardInput {
  private keys = new Set<string>();
  private pauseLatch = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Escape", "KeyZ", "KeyX"].includes(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);
      if (event.code === "Escape") this.pauseLatch = true;
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  read(): InputFrame {
    const frame: InputFrame = {
      players: [
        { left: this.keys.has("ArrowLeft"), right: this.keys.has("ArrowRight") },
        { left: this.keys.has("KeyZ"), right: this.keys.has("KeyX") }
      ],
      pausePressed: this.pauseLatch
    };
    this.pauseLatch = false;
    return frame;
  }
}

export class TouchInput {
  private activePointers = new Map<number, TouchDirection>();
  private pauseLatch = false;

  setPointer(pointerId: number, direction: TouchDirection): void {
    this.activePointers.set(pointerId, direction);
  }

  releasePointer(pointerId: number): void {
    this.activePointers.delete(pointerId);
  }

  clear(): void {
    this.activePointers.clear();
  }

  pressPause(): void {
    this.pauseLatch = true;
  }

  peekDirection(): TouchDirection | "neutral" | "none" {
    const hasLeft = Array.from(this.activePointers.values()).includes("left");
    const hasRight = Array.from(this.activePointers.values()).includes("right");
    return hasLeft && hasRight ? "neutral" : hasLeft ? "left" : hasRight ? "right" : "none";
  }

  read(): { player: PlayerInput; pausePressed: boolean; direction: TouchDirection | "neutral" | "none" } {
    const direction = this.peekDirection();
    const pausePressed = this.pauseLatch;
    this.pauseLatch = false;
    return {
      player: {
        left: direction === "left",
        right: direction === "right"
      },
      pausePressed,
      direction
    };
  }
}

export class CombinedInput {
  constructor(
    private readonly keyboard: KeyboardInput,
    private readonly touch: TouchInput
  ) {}

  read(): InputFrame {
    const keyboard = this.keyboard.read();
    const touch = this.touch.read();
    return {
      players: [
        {
          left: keyboard.players[0].left || touch.player.left,
          right: keyboard.players[0].right || touch.player.right
        },
        { ...keyboard.players[1] }
      ],
      pausePressed: keyboard.pausePressed || touch.pausePressed
    };
  }
}

export function emptyInputFrame(pausePressed = false): InputFrame {
  return {
    players: [{ ...EMPTY_PLAYER_INPUT }, { ...EMPTY_PLAYER_INPUT }],
    pausePressed
  };
}
