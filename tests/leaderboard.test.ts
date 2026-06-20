import { describe, expect, test } from "vitest";
import * as leaderboardModule from "../src/game/leaderboard";
import {
  FirebaseLeaderboard,
  leaderboardPath,
  normalizeLeaderboardEntries,
  rankLeaderboardSubmission,
  type LeaderboardDatabasePort,
  type LeaderboardSubmission
} from "../src/game/leaderboard";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

class FakeLeaderboardDatabase implements LeaderboardDatabasePort {
  failWrites = false;
  writes: Array<{ path: string; value: unknown }> = [];
  values: Record<string, LeaderboardSubmission> = {};
  async ensureAuthenticated() { return "uid-1"; }
  async set(path: string, value: unknown) {
    if (this.failWrites) throw new Error("offline");
    this.writes.push({ path, value });
  }
  async queryTop() { return this.values; }
  serverTimestamp() { return 1234; }
}

describe("global leaderboard", () => {
  test("builds five fixed-width rows without merging two-player names", () => {
    const buildRows = (leaderboardModule as unknown as {
      buildLeaderboardRows: (
        mode: "coop",
        entries: Array<{ id: string; uid: string; player1: string; player2?: string; floor: number; createdAt: number }>
      ) => Array<Record<string, unknown>>;
    }).buildLeaderboardRows;
    const rows = buildRows("coop", [{
      id: "one", uid: "uid", player1: "PLAYER123", player2: "GUEST999", floor: 42, createdAt: 1
    }]);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      rank: 1,
      player1: "PLAYER12",
      player2: "GUEST999",
      floor: 42,
      layoutMode: "coop"
    });
    expect(rows[1]).toEqual({
      rank: 2,
      player1: "--------",
      player2: "--------",
      floor: 0,
      layoutMode: "coop"
    });
  });

  test("uses the namespaced mode and difficulty path", () => {
    expect(leaderboardPath("coop", "hard")).toBe("ns-shaft/leaderboards/coop/hard");
  });

  test("returns the best five by floor and earlier timestamp", () => {
    const entries: Record<string, LeaderboardSubmission> = {
      a: { uid: "u1", player1: "A", floor: 9, createdAt: 200 },
      b: { uid: "u2", player1: "B", floor: 12, createdAt: 300 },
      c: { uid: "u3", player1: "C", floor: 12, createdAt: 100 },
      d: { uid: "u4", player1: "D", floor: 8, createdAt: 100 },
      e: { uid: "u5", player1: "E", floor: 7, createdAt: 100 },
      f: { uid: "u6", player1: "F", floor: 6, createdAt: 100 }
    };
    expect(normalizeLeaderboardEntries(entries).map((entry) => entry.player1))
      .toEqual(["C", "B", "A", "D", "E"]);
  });

  test("queues a failed submission and retries with the same id", async () => {
    const database = new FakeLeaderboardDatabase();
    const storage = new MemoryStorage();
    const leaderboard = new FirebaseLeaderboard(database, storage, () => "stable-id");
    database.failWrites = true;

    await expect(leaderboard.submit({
      mode: "solo", difficulty: "normal", player1: "alice!", floor: 18
    })).resolves.toEqual({ id: "stable-id", submitted: false });
    database.failWrites = false;
    await expect(leaderboard.retryPending()).resolves.toBe(1);

    expect(database.writes[0]).toEqual({
      path: "ns-shaft/leaderboards/solo/normal/stable-id",
      value: { uid: "uid-1", player1: "ALICE", floor: 18, createdAt: 1234 }
    });
  });

  test("returns a stable submission id and finds its Best 5 rank", async () => {
    const database = new FakeLeaderboardDatabase();
    const storage = new MemoryStorage();
    const leaderboard = new FirebaseLeaderboard(database, storage, () => "current-run");
    await expect(leaderboard.submit({
      mode: "race", difficulty: "normal", player1: "RUNNER", floor: 20
    })).resolves.toEqual({ id: "current-run", submitted: true });
    const entries = normalizeLeaderboardEntries({
      first: { uid: "u1", player1: "AAA", floor: 30, createdAt: 1 },
      "current-run": { uid: "uid-1", player1: "RUNNER", floor: 20, createdAt: 2 }
    });
    expect(rankLeaderboardSubmission(entries, "current-run")).toBe(2);
    expect(rankLeaderboardSubmission(entries, "missing")).toBeNull();
  });

  test("caches successful top-five reads and exposes the world record", async () => {
    const database = new FakeLeaderboardDatabase();
    const storage = new MemoryStorage();
    database.values = {
      one: { uid: "u", player1: "AAA", floor: 33, createdAt: 1 }
    };
    const leaderboard = new FirebaseLeaderboard(database, storage);

    const entries = await leaderboard.loadTop("race", "hard");

    expect(entries[0].floor).toBe(33);
    expect(leaderboard.cachedWorldRecord("race", "hard")).toBe(33);
  });
});
