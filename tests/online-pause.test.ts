import { describe, expect, test } from "vitest";
import {
  markPauseReady,
  normalizeOnlinePause,
  onlineConnectionState,
  requestOnlinePause,
  schedulePauseResume,
  type OnlinePauseState
} from "../src/game/online/pause";

describe("online pause lifecycle", () => {
  test("restores Firebase-omitted null resumeAt while waiting for ready", () => {
    expect(normalizeOnlinePause({
      requestedBy: 0,
      ready: { 0: false, 1: false }
    })).toEqual({
      requestedBy: 0,
      ready: { 0: false, 1: false },
      resumeAt: null
    });
  });

  test("requires both players before scheduling a three second resume", () => {
    let pause: OnlinePauseState = requestOnlinePause(1);
    expect(pause).toEqual({ requestedBy: 1, ready: { 0: false, 1: false }, resumeAt: null });
    pause = markPauseReady(pause, 1);
    expect(schedulePauseResume(pause, 10_000)).toEqual(pause);
    pause = markPauseReady(pause, 0);
    expect(schedulePauseResume(pause, 10_000)?.resumeAt).toBe(13_000);
  });

  test("suppresses stale snapshot warnings while paused and uses a five second threshold", () => {
    expect(onlineConnectionState(null, null)).toBe("syncing");
    expect(onlineConnectionState(4_999, null)).toBe("connected");
    expect(onlineConnectionState(5_000, null)).toBe("disconnected");
    expect(onlineConnectionState(50_000, requestOnlinePause(0))).toBe("connected");
  });
});
