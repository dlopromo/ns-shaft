import { describe, expect, test } from "vitest";
import {
  ONLINE_COUNTDOWN_MS,
  ONLINE_GO_MS,
  ONLINE_RESULTS_MS,
  nextOnlineHostAction,
  onlineCountdownLabel,
  onlineRaceResult,
  shouldShowRemoteWaiting
} from "../src/game/online/round";

describe("online round lifecycle", () => {
  test("shows a five second countdown followed by a short GO cue", () => {
    expect(ONLINE_COUNTDOWN_MS).toBe(5000);
    expect(ONLINE_GO_MS).toBe(500);
    expect(onlineCountdownLabel(0, 5000)).toBe("5");
    expect(onlineCountdownLabel(1000, 5000)).toBe("4");
    expect(onlineCountdownLabel(4999, 5000)).toBe("1");
    expect(onlineCountdownLabel(5000, 5000)).toBe("GO!");
    expect(onlineCountdownLabel(5499, 5000)).toBe("GO!");
    expect(onlineCountdownLabel(5500, 5000)).toBeNull();
  });

  test("shows the remote waiting overlay only during active play", () => {
    expect(shouldShowRemoteWaiting("countdown", true)).toBe(false);
    expect(shouldShowRemoteWaiting("playing", true)).toBe(true);
    expect(shouldShowRemoteWaiting("results", true)).toBe(false);
    expect(shouldShowRemoteWaiting("playing", false)).toBe(false);
  });

  test("keeps results visible for three seconds and compares floors", () => {
    expect(ONLINE_RESULTS_MS).toBe(3000);
    expect(onlineRaceResult(12, 8)).toBe("YOU WIN");
    expect(onlineRaceResult(8, 12)).toBe("YOU LOSE");
    expect(onlineRaceResult(12, 12)).toBe("DRAW");
  });

  test("lets only completed phase conditions advance the host lifecycle", () => {
    expect(nextOnlineHostAction({
      phase: "lobby", bothReady: false, roundFinished: false, now: 1000
    })).toBeNull();
    expect(nextOnlineHostAction({
      phase: "lobby", bothReady: true, roundFinished: false, now: 1000
    })).toBe("begin-countdown");
    expect(nextOnlineHostAction({
      phase: "countdown", bothReady: true, roundFinished: false,
      now: 5999, countdownEndsAt: 6000
    })).toBeNull();
    expect(nextOnlineHostAction({
      phase: "countdown", bothReady: true, roundFinished: false,
      now: 6000, countdownEndsAt: 6000
    })).toBe("begin-playing");
    expect(nextOnlineHostAction({
      phase: "playing", bothReady: true, roundFinished: false, now: 7000
    })).toBeNull();
    expect(nextOnlineHostAction({
      phase: "playing", bothReady: true, roundFinished: true, now: 7000
    })).toBe("begin-results");
    expect(nextOnlineHostAction({
      phase: "results", bothReady: true, roundFinished: true,
      now: 9999, resultsEndsAt: 10000
    })).toBeNull();
    expect(nextOnlineHostAction({
      phase: "results", bothReady: true, roundFinished: true,
      now: 10000, resultsEndsAt: 10000
    })).toBe("reset-lobby");
  });
});
