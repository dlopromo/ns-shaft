import { describe, expect, test } from "vitest";
import { FirebaseOnlineSession, type OnlineDatabasePort } from "../src/game/online/session";

class FakeOnlineDatabase implements OnlineDatabasePort {
  data = new Map<string, unknown>();
  removed: string[] = [];
  subscriptions: { path: string; callback: (value: unknown) => void }[] = [];
  authCalls = 0;

  async ensureAuthenticated(): Promise<string> {
    this.authCalls += 1;
    return "test-uid";
  }

  async get(path: string): Promise<unknown> {
    return this.data.get(path) ?? null;
  }

  async set(path: string, value: unknown): Promise<void> {
    this.data.set(path, value);
  }

  async update(path: string, value: Record<string, unknown>): Promise<void> {
    const current = this.data.get(path);
    this.data.set(path, { ...(current as Record<string, unknown> | null), ...value });
  }

  async remove(path: string): Promise<void> {
    this.data.delete(path);
  }

  onValue(path: string, callback: (value: unknown) => void): () => void {
    this.subscriptions.push({ path, callback });
    return () => {
      this.subscriptions = this.subscriptions.filter((item) => item.callback !== callback);
    };
  }

  onDisconnectRemove(path: string): void {
    this.removed.push(path);
  }

  async getServerTimeOffset(): Promise<number> {
    return 25;
  }
}

describe("FirebaseOnlineSession", () => {
  test("creates a numeric room and retries code collisions", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/0001/meta", { existing: true });
    const codes = ["0001", "0002"];
    const session = new FirebaseOnlineSession(db, () => codes.shift()!);

    const room = await session.createRoom({
      playerName: "HOST",
      seed: 123,
      difficulty: "normal",
      mode: "race",
      options: { conveyor: true, spring: true, rotating: true, fast: false }
    });

    expect(room).toMatchObject({ roomCode: "0002", mode: "race" });
    expect(db.authCalls).toBeGreaterThan(0);
    expect(db.data.get("ns-shaft/rooms/0002/meta")).toMatchObject({
      seed: 123,
      difficulty: "normal",
      mode: "race",
      phase: "lobby",
      hostConnected: true,
      guestConnected: false
    });
    expect(db.data.get("ns-shaft/rooms/0002/players/0")).toMatchObject({
      name: "HOST",
      role: "host",
      ready: false,
      connected: true
    });
    expect(db.removed).toContain("ns-shaft/rooms/0002");
  });

  test("joins an existing room as guest", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/1234/meta", {
      phase: "lobby",
      mode: "race",
      guestConnected: false
    });
    const session = new FirebaseOnlineSession(db, () => "9999");

    const room = await session.joinRoom("1234", "GUEST");

    expect(room).toEqual({
      roomCode: "1234",
      role: "guest",
      playerId: 1,
      mode: "race"
    });
    expect(db.data.get("ns-shaft/rooms/1234/players/1")).toMatchObject({
      name: "GUEST",
      role: "guest",
      ready: false,
      connected: true
    });
    expect(db.data.get("ns-shaft/rooms/1234/meta")).toMatchObject({ guestConnected: true });
  });

  test("rejects missing, full, and malformed rooms", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/2222/meta", { phase: "lobby", guestConnected: true });
    db.data.set("ns-shaft/rooms/3333/meta", { phase: "countdown", guestConnected: false });
    const session = new FirebaseOnlineSession(db, () => "1111");

    await expect(session.joinRoom("ABCD", "GUEST")).rejects.toThrow("Room code must be 4 digits");
    await expect(session.joinRoom("1111", "GUEST")).rejects.toThrow("Room not found");
    await expect(session.joinRoom("2222", "GUEST")).rejects.toThrow("Room is full");
    await expect(session.joinRoom("3333", "GUEST")).rejects.toThrow("Room is not in lobby");
  });

  test("writes ready state and per-tick input frames", async () => {
    const db = new FakeOnlineDatabase();
    const session = new FirebaseOnlineSession(db, () => "111111");

    await session.setReady("555555", 0, true);
    await session.setPauseReady("555555", 1, true);
    await session.updateMeta("555555", { phase: "playing" });
    await session.sendInput("555555", 12, 1, {
      left: true,
      right: false,
      pausePressed: false
    });

    expect(db.data.get("ns-shaft/rooms/555555/players/0")).toMatchObject({ ready: true });
    expect(db.data.get("ns-shaft/rooms/555555/meta/pause/ready/1")).toBe(true);
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({ phase: "playing" });
    expect(db.data.get("ns-shaft/rooms/555555/inputs/12/1")).toEqual({
      left: true,
      right: false,
      pausePressed: false
    });
  });

  test("moves through countdown, playing, results, and reusable lobby phases", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/555555/players/0", { ready: true, name: "HOST" });
    db.data.set("ns-shaft/rooms/555555/players/1", { ready: true, name: "GUEST" });
    db.data.set("ns-shaft/rooms/555555/inputs", { stale: true });
    db.data.set("ns-shaft/rooms/555555/raceSnapshots", { stale: true });
    const session = new FirebaseOnlineSession(db, () => "111111");

    expect(await session.getServerTimeOffset()).toBe(25);
    await session.beginCountdown("555555", {
      seed: 987,
      round: 2,
      countdownEndsAt: 6000
    });
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({
      phase: "countdown",
      seed: 987,
      round: 2,
      countdownEndsAt: 6000
    });
    expect(db.data.has("ns-shaft/rooms/555555/inputs")).toBe(false);
    expect(db.data.has("ns-shaft/rooms/555555/raceSnapshots")).toBe(false);

    await session.beginPlaying("555555");
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({ phase: "playing" });
    await session.beginResults("555555", 9000);
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({
      phase: "results",
      resultsEndsAt: 9000
    });

    await session.resetForRematch("555555");
    expect(db.data.get("ns-shaft/rooms/555555/players/0")).toMatchObject({ ready: false });
    expect(db.data.get("ns-shaft/rooms/555555/players/1")).toMatchObject({ ready: false });
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({
      phase: "lobby",
      countdownEndsAt: null,
      resultsEndsAt: null
    });
  });

  test("writes and subscribes to per-player race snapshots", async () => {
    const db = new FakeOnlineDatabase();
    const session = new FirebaseOnlineSession(db, () => "111111");
    const snapshot = {
      playerId: 1 as const,
      name: "GUEST",
      sentAt: 2000,
      finishedFloor: 12,
      state: {
        mode: "playing" as const,
        difficulty: "normal" as const,
        floor: 12,
        floorSequence: 12,
        level: 0,
        timeMs: 500,
        cameraY: 20,
        ticks: 30,
        players: [],
        platforms: []
      }
    };

    await session.sendRaceSnapshot("555555", 1, snapshot);
    const unsubscribe = session.subscribeRaceSnapshots("555555", () => undefined);

    expect(db.data.get("ns-shaft/rooms/555555/raceSnapshots/1")).toEqual(snapshot);
    expect(db.subscriptions.at(-1)?.path).toBe("ns-shaft/rooms/555555/raceSnapshots");
    unsubscribe();
  });

  test("guest leaves without destroying the reusable room", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/555555/meta", {
      phase: "playing",
      hostConnected: true,
      guestConnected: true
    });
    db.data.set("ns-shaft/rooms/555555/players/1", {
      name: "GUEST",
      role: "guest",
      ready: true,
      connected: true
    });
    const session = new FirebaseOnlineSession(db, () => "111111");

    await session.leaveRoom("555555", 1);

    expect(db.data.get("ns-shaft/rooms/555555/players/1")).toBeUndefined();
    expect(db.data.get("ns-shaft/rooms/555555/meta")).toMatchObject({
      guestConnected: false,
      phase: "lobby"
    });
    expect(db.data.get("ns-shaft/rooms/555555/players/0")).toMatchObject({ ready: false });
  });

  test("host leave removes the complete room", async () => {
    const db = new FakeOnlineDatabase();
    db.data.set("ns-shaft/rooms/555555", { meta: { phase: "lobby" } });
    const session = new FirebaseOnlineSession(db, () => "111111");

    await session.leaveRoom("555555", 0);

    expect(db.data.has("ns-shaft/rooms/555555")).toBe(false);
  });
});
