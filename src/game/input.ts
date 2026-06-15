import type { InputFrame } from "./types";

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

