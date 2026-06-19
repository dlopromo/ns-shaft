export const ONLINE_RESUME_COUNTDOWN_MS = 3000;
export const ONLINE_DISCONNECT_MS = 5000;

export interface ActiveOnlinePause {
  requestedBy: 0 | 1;
  ready: Record<0 | 1, boolean>;
  resumeAt: number | null;
}

export type OnlinePauseState = ActiveOnlinePause | null;
export type OnlineConnectionState = "connected" | "syncing" | "disconnected";

export function normalizeOnlinePause(
  pause: Omit<ActiveOnlinePause, "resumeAt"> & { resumeAt?: number | null }
): ActiveOnlinePause {
  return { ...pause, resumeAt: pause.resumeAt ?? null };
}

export function requestOnlinePause(playerId: 0 | 1): ActiveOnlinePause {
  return { requestedBy: playerId, ready: { 0: false, 1: false }, resumeAt: null };
}

export function markPauseReady(pause: OnlinePauseState, playerId: 0 | 1): OnlinePauseState {
  if (!pause || pause.resumeAt !== null) return pause;
  return { ...pause, ready: { ...pause.ready, [playerId]: true } };
}

export function schedulePauseResume(pause: OnlinePauseState, now: number): OnlinePauseState {
  if (!pause || pause.resumeAt !== null || !pause.ready[0] || !pause.ready[1]) return pause;
  return { ...pause, resumeAt: now + ONLINE_RESUME_COUNTDOWN_MS };
}

export function onlineConnectionState(
  remoteAgeMs: number | null,
  pause: OnlinePauseState
): OnlineConnectionState {
  if (pause) return "connected";
  if (remoteAgeMs === null) return "syncing";
  return remoteAgeMs < ONLINE_DISCONNECT_MS ? "connected" : "disconnected";
}
