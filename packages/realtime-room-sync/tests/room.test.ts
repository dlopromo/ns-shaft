import { describe, expect, it } from "vitest";
import { InMemoryRealtimeRoomTransport, RoomClient } from "../src/index.js";

describe("RoomClient", () => {
  it("supports 2/3/4 player capacities and starts with active ready players", async () => {
    for (const capacity of [2, 3, 4] as const) {
      const transport = new InMemoryRealtimeRoomTransport<{ speed: number }>();
      const clients = Array.from({ length: capacity }, (_, i) => new RoomClient({ transport, clientId: `c${i}`, now: () => 1000 }));
      const host = await clients[0].createRoom({ code: `${capacity}234`, capacity, name: "HOST", settings: { speed: 1 } });
      for (let i = 1; i < capacity; i++) await clients[i].joinRoom({ code: host.code, name: `P${i}` });
      for (const client of clients) await client.setReady(true);
      await clients[0].start(5000);
      expect(clients[0].state?.meta.phase).toBe("countdown");
      expect(clients[0].state?.meta.activePlayerIds).toHaveLength(capacity);
    }
  });

  it("prevents over-capacity joins and validates numeric room codes", async () => {
    const transport = new InMemoryRealtimeRoomTransport<object>();
    const host = new RoomClient({ transport, clientId: "host" });
    await expect(host.createRoom({ code: "ABCD", capacity: 2, name: "H", settings: {} })).rejects.toThrow(/numeric/i);
    const room = await host.createRoom({ code: "1234", capacity: 2, name: "H", settings: {} });
    await new RoomClient({ transport, clientId: "g" }).joinRoom({ code: room.code, name: "G" });
    await expect(new RoomClient({ transport, clientId: "x" }).joinRoom({ code: room.code, name: "X" })).rejects.toThrow(/full/i);
  });

  it("handles pause, resume, results, and rematch", async () => {
    const { host, guest } = await roomPair();
    await host.setReady(true); await guest.setReady(true); await host.start(0); await host.beginPlaying();
    await guest.requestPause();
    expect(host.state?.meta.phase).toBe("paused");
    await host.setPauseReady(true); await guest.setPauseReady(true); await host.resume(100);
    expect(host.state?.meta.resumeAt).toBe(100);
    await host.finish({ winner: 0 });
    await host.rematch();
    expect(host.state?.meta.phase).toBe("lobby");
    expect(host.state?.meta.round).toBe(2);
  });

  it("closes when host leaves and removes timed-out guests with a new epoch", async () => {
    const { transport, host, guest } = await roomPair();
    await host.setReady(true); await guest.setReady(true); await host.start(0); await host.beginPlaying();
    await guest.disconnect();
    expect(host.state?.meta.phase).toBe("paused");
    await host.removeExpiredPlayers(8000, { tick: 20, state: { floor: 4 }, hash: "h" });
    expect(host.state?.meta.phase).toBe("results");
    expect(host.state?.meta.participantEpoch).toBe(2);
    await host.leave();
    expect(await transport.readRoom(host.handle!.code)).toBeNull();
  });

  it("reconnects a guest within the grace period", async () => {
    const { guest } = await roomPair();
    const handle = guest.handle!;
    await guest.disconnect();
    const resumed = new RoomClient({ transport: guest.transport, clientId: "guest-new" });
    await resumed.reconnect(handle);
    expect(resumed.player?.connected).toBe(true);
    expect(resumed.handle?.playerId).toBe(1);
  });

  it("closes the room when the host reconnect grace period expires", async () => {
    const { transport, host, guest } = await roomPair();
    const code = host.handle!.code;
    await host.disconnect();
    await guest.removeExpiredPlayers(8000, { tick: 0, state: {}, hash: "closed" });
    expect(await transport.readRoom(code)).toBeNull();
  });
});

async function roomPair() {
  let now = 1000;
  const transport = new InMemoryRealtimeRoomTransport<object>();
  const host = new RoomClient({ transport, clientId: "host", now: () => now, reconnectGraceMs: 2000 });
  const guest = new RoomClient({ transport, clientId: "guest", now: () => now, reconnectGraceMs: 2000 });
  const room = await host.createRoom({ code: "1234", capacity: 2, name: "HOST", settings: {} });
  await guest.joinRoom({ code: room.code, name: "GUEST" });
  now = 5000;
  return { transport, host, guest };
}
