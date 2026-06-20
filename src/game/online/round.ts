export const ONLINE_COUNTDOWN_MS = 5000;
export const ONLINE_GO_MS = 500;
export const ONLINE_RESULTS_MS = 5000;

export type OnlineRoomPhase = "lobby" | "countdown" | "playing" | "results" | "ended";
export type OnlineHostAction =
  | "begin-playing" | "begin-results" | "reset-lobby";

export function nextOnlineHostAction(input: {
  phase: OnlineRoomPhase;
  bothReady: boolean;
  roundFinished: boolean;
  now: number;
  countdownEndsAt?: number;
  resultsEndsAt?: number;
}): OnlineHostAction | null {
  if (input.phase === "lobby") return null;
  if (input.phase === "countdown") {
    return input.countdownEndsAt !== undefined && input.now >= input.countdownEndsAt
      ? "begin-playing" : null;
  }
  if (input.phase === "playing") return input.roundFinished ? "begin-results" : null;
  if (input.phase === "results") {
    return input.resultsEndsAt !== undefined && input.now >= input.resultsEndsAt
      ? "reset-lobby" : null;
  }
  return null;
}

export function onlineCountdownLabel(now: number, countdownEndsAt: number): string | null {
  const remaining = countdownEndsAt - now;
  if (remaining > 0) return String(Math.max(1, Math.ceil(remaining / 1000)));
  if (now < countdownEndsAt + ONLINE_GO_MS) return "GO!";
  return null;
}

export function onlineResultsCountdownLabel(now: number, resultsEndsAt: number): string {
  return String(Math.max(0, Math.ceil((resultsEndsAt - now) / 1000)));
}

export interface OnlineResultViewModel {
  mode: "coop" | "race";
  localFloor: number;
  remoteFloor?: number;
  placement: 1 | 2 | null;
  best5Rank: number | null;
  rankingPending: boolean;
  seconds: number;
}

export function buildOnlineResultViewModel(input: Omit<OnlineResultViewModel, "placement">): OnlineResultViewModel {
  const placement = input.mode !== "race" || input.remoteFloor === undefined ||
    input.localFloor === input.remoteFloor
    ? null
    : input.localFloor > input.remoteFloor ? 1 : 2;
  return { ...input, placement };
}

export function onlineRaceResult(localFloor: number, remoteFloor: number):
  "YOU WIN" | "YOU LOSE" | "DRAW" {
  if (localFloor === remoteFloor) return "DRAW";
  return localFloor > remoteFloor ? "YOU WIN" : "YOU LOSE";
}
