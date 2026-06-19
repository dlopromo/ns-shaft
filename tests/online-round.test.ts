import { describe, expect, test } from "vitest";
import {
  ONLINE_COUNTDOWN_MS,
  ONLINE_GO_MS,
  ONLINE_RESULTS_MS,
  nextOnlineHostAction,
  onlineCountdownLabel,
  onlineResultsCountdownLabel,
  buildOnlineResultViewModel,
  onlineRaceResult
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

  test("builds race and co-op result models with placement, rank, and countdown", () => {
    expect(buildOnlineResultViewModel({
      mode: "race", localFloor: 12, remoteFloor: 8,
      best5Rank: 2, rankingPending: false, seconds: 5
    })).toEqual({
      mode: "race", localFloor: 12, remoteFloor: 8, placement: 1,
      best5Rank: 2, rankingPending: false, seconds: 5
    });
    expect(buildOnlineResultViewModel({
      mode: "coop", localFloor: 9, best5Rank: null,
      rankingPending: false, seconds: 1
    })).toEqual({
      mode: "coop", localFloor: 9, placement: null,
      best5Rank: null, rankingPending: false, seconds: 1
    });
  });

  test("keeps results visible for five seconds and compares floors", () => {
    expect(ONLINE_RESULTS_MS).toBe(5000);
    expect(onlineRaceResult(12, 8)).toBe("YOU WIN");
    expect(onlineRaceResult(8, 12)).toBe("YOU LOSE");
    expect(onlineRaceResult(12, 12)).toBe("DRAW");
    expect(onlineResultsCountdownLabel(5000, 10000)).toBe("5");
    expect(onlineResultsCountdownLabel(9999, 10000)).toBe("1");
    expect(onlineResultsCountdownLabel(10000, 10000)).toBe("0");
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
