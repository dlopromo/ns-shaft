export const ONLINE_COUNTDOWN_MS = 5000;
export const ONLINE_GO_MS = 500;
export const ONLINE_RESULTS_MS = 3000;

export type OnlineRoomPhase = "lobby" | "countdown" | "playing" | "results" | "ended";
export type OnlineHostAction =
  | "begin-countdown" | "begin-playing" | "begin-results" | "reset-lobby";

export function nextOnlineHostAction(input: {
  phase: OnlineRoomPhase;
  bothReady: boolean;
  roundFinished: boolean;
  now: number;
  countdownEndsAt?: number;
  resultsEndsAt?: number;
}): OnlineHostAction | null {
  if (input.phase === "lobby") return input.bothReady ? "begin-countdown" : null;
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

export function onlineRaceResult(localFloor: number, remoteFloor: number):
  "YOU WIN" | "YOU LOSE" | "DRAW" {
  if (localFloor === remoteFloor) return "DRAW";
  return localFloor > remoteFloor ? "YOU WIN" : "YOU LOSE";
}

export function shouldShowRemoteWaiting(
  phase: OnlineRoomPhase | null,
  remoteWaiting: boolean
): boolean {
  return phase === "playing" && remoteWaiting;
}
