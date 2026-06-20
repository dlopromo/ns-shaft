import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { RoomClient } from "../src/index.js";
import { FirebaseRealtimeTransport } from "../src/firebase.js";

const apps: FirebaseApp[] = [];

describe("FirebaseRealtimeTransport", () => {
  beforeAll(() => { process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; });
  afterAll(async () => { await Promise.all(apps.map(deleteApp)); });

  it("atomically joins four clients, enforces capacity, and isolates namespaces", async () => {
    const transports = await Promise.all(Array.from({ length: 5 }, (_, index) => transport(`client-${index}`, "example-game")));
    const clients = transports.map((value, index) => new RoomClient({ transport: value, clientId: `client-${index}` }));
    const room = await clients[0].createRoom({ code: "4567", capacity: 4, name: "HOST", settings: { speed: 1 } });
    await Promise.all(clients.slice(1, 4).map((client, index) => client.joinRoom({ code: room.code, name: `P${index + 1}` })));
    await expect(clients[4].joinRoom({ code: room.code, name: "EXTRA" })).rejects.toThrow(/full/i);
    expect(clients[0].state?.meta.activePlayerIds).toEqual([0, 1, 2, 3]);

    const isolated = await transport("isolated", "another-game");
    expect(await isolated.readRoom(room.code)).toBeNull();
  });

  it("reconnects and resumes a round after participant removal", async () => {
    let now = 1000;
    const transports = await Promise.all(Array.from({ length: 3 }, (_, index) => transport(`resume-${index}`, "resume-game")));
    const clients = transports.map((value, index) => new RoomClient({ transport: value, clientId: `resume-${index}`, now: () => now, reconnectGraceMs: 1000 }));
    const handle = await clients[0].createRoom({ code: "7654", capacity: 3, name: "HOST", settings: {} });
    await clients[1].joinRoom({ code: handle.code, name: "P1" });
    const reconnectHandle = await clients[2].joinRoom({ code: handle.code, name: "P2" });
    await clients[2].disconnect();
    await new RoomClient({ transport: transports[2], clientId: "resume-new", now: () => now }).reconnect(reconnectHandle);
    await clients[2].disconnect();
    now = 3000;
    await clients[0].removeExpiredPlayers(now, { tick: 30, state: { score: 10 }, hash: "hash" });
    expect(clients[0].state?.meta.activePlayerIds).toEqual([0, 1]);
    expect(clients[0].state?.meta.participantEpoch).toBe(2);
    expect(clients[0].state?.meta.phase).toBe("paused");
  });
});

async function transport(name: string, namespace: string) {
  const app = initializeApp({ apiKey: "demo", projectId: "demo-realtime-room-sync", databaseURL: "https://demo-realtime-room-sync-default-rtdb.firebaseio.com" }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInAnonymously(auth);
  const database = getDatabase(app);
  connectDatabaseEmulator(database, "127.0.0.1", 9002);
  return new FirebaseRealtimeTransport({ database, namespace });
}
