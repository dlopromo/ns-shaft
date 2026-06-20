import { describe, expect, test } from "vitest";
import { CombinedInput, TouchInput } from "../src/game/input";
import type { InputFrame } from "../src/game/types";

class StubKeyboardInput {
  constructor(private readonly frame: InputFrame) {}
  read(): InputFrame {
    return {
      players: [
        { ...this.frame.players[0] },
        { ...this.frame.players[1] }
      ],
      pausePressed: this.frame.pausePressed
    };
  }
}

function idleFrame(pausePressed = false): InputFrame {
  return {
    players: [{ left: false, right: false }, { left: false, right: false }],
    pausePressed
  };
}

describe("TouchInput", () => {
  test("sets and clears left direction", () => {
    const touch = new TouchInput();
    touch.setPointer(1, "left");
    expect(touch.peekDirection()).toBe("left");
    expect(touch.read().player).toEqual({ left: true, right: false });
    touch.releasePointer(1);
    expect(touch.peekDirection()).toBe("none");
  });

  test("sets and clears right direction", () => {
    const touch = new TouchInput();
    touch.setPointer(2, "right");
    expect(touch.peekDirection()).toBe("right");
    expect(touch.read().player).toEqual({ left: false, right: true });
    touch.releasePointer(2);
    expect(touch.peekDirection()).toBe("none");
  });

  test("neutralizes simultaneous left and right touch", () => {
    const touch = new TouchInput();
    touch.setPointer(1, "left");
    touch.setPointer(2, "right");
    const frame = touch.read();
    expect(frame.direction).toBe("neutral");
    expect(frame.player).toEqual({ left: false, right: false });
  });

  test("clears every active pointer", () => {
    const touch = new TouchInput();
    touch.setPointer(1, "left");
    touch.setPointer(2, "right");
    touch.clear();
    expect(touch.peekDirection()).toBe("none");
  });

  test("pause is latched once", () => {
    const touch = new TouchInput();
    touch.pressPause();
    expect(touch.read().pausePressed).toBe(true);
    expect(touch.read().pausePressed).toBe(false);
  });
});

describe("CombinedInput", () => {
  test("merges touch into player 1 without changing keyboard player 2", () => {
    const touch = new TouchInput();
    touch.setPointer(1, "left");
    const keyboard = new StubKeyboardInput({
      players: [{ left: false, right: false }, { left: true, right: false }],
      pausePressed: false
    });
    const input = new CombinedInput(keyboard as never, touch);
    expect(input.read()).toEqual({
      players: [{ left: true, right: false }, { left: true, right: false }],
      pausePressed: false
    });
  });

  test("merges keyboard and touch pause latches", () => {
    const touch = new TouchInput();
    touch.pressPause();
    const input = new CombinedInput(new StubKeyboardInput(idleFrame(false)) as never, touch);
    expect(input.read().pausePressed).toBe(true);
  });
});
