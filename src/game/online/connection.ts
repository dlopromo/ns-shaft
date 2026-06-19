export const SYNCING_AFTER_MS = 5_000;
export const DISCONNECT_CONFIRM_MS = 15_000;

export type OnlineConnectionState = "healthy" | "syncing" | "disconnected";

export function connectionPresentation(state: OnlineConnectionState): {
  indicator: boolean;
  dialog: boolean;
} {
  return {
    indicator: state === "syncing",
    dialog: state === "disconnected"
  };
}

export class OnlineConnectionMonitor {
  private lastPeerActivityAt: number;
  private peerPresenceConnected = true;
  private peerPresenceFalseSince: number | null = null;

  constructor(now: number) {
    this.lastPeerActivityAt = now;
  }

  reset(now: number): void {
    this.lastPeerActivityAt = now;
    this.peerPresenceConnected = true;
    this.peerPresenceFalseSince = null;
  }

  markPeerActivity(now: number): void {
    this.lastPeerActivityAt = now;
  }

  setPeerPresence(connected: boolean, now: number): void {
    this.peerPresenceConnected = connected;
    if (connected) {
      this.peerPresenceFalseSince = null;
    } else {
      this.peerPresenceFalseSince ??= now;
    }
  }

  state(now: number, suppressed = false): OnlineConnectionState {
    if (suppressed) return "healthy";
    const activityAge = Math.max(0, now - this.lastPeerActivityAt);
    if (activityAge < SYNCING_AFTER_MS) return "healthy";
    const presenceAge = this.peerPresenceConnected || this.peerPresenceFalseSince === null
      ? 0
      : Math.max(0, now - this.peerPresenceFalseSince);
    return activityAge >= DISCONNECT_CONFIRM_MS &&
      presenceAge >= DISCONNECT_CONFIRM_MS
      ? "disconnected"
      : "syncing";
  }
}
