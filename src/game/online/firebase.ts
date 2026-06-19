import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  get,
  connectDatabaseEmulator,
  getDatabase,
  limitToLast,
  onChildAdded,
  onChildChanged,
  onDisconnect,
  onValue,
  orderByChild,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database
} from "firebase/database";
import type { FirebaseConfig } from "./room";
import type { OnlineDatabasePort } from "./session";
import type { LeaderboardSubmission } from "../leaderboard";

export class RealtimeDatabasePort implements OnlineDatabasePort {
  private readonly database: Database;
  private readonly auth: Auth;
  private authentication?: Promise<string>;

  constructor(app: FirebaseApp) {
    this.database = getDatabase(app);
    this.auth = getAuth(app);
  }

  ensureAuthenticated(): Promise<string> {
    this.authentication ??= (this.auth.currentUser
      ? Promise.resolve(this.auth.currentUser.uid)
      : signInAnonymously(this.auth).then(({ user }) => user.uid));
    return this.authentication;
  }

  async get(path: string): Promise<unknown> {
    const snapshot = await get(ref(this.database, path));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async set(path: string, value: unknown): Promise<void> {
    await set(ref(this.database, path), value);
  }

  async update(path: string, value: Record<string, unknown>): Promise<void> {
    await update(ref(this.database, path), value);
  }

  onValue(path: string, callback: (value: unknown) => void): () => void {
    return onValue(ref(this.database, path), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  onChild(path: string, callback: (value: unknown) => void): () => void {
    const target = ref(this.database, path);
    const added = onChildAdded(target, (snapshot) => callback(snapshot.val()));
    const changed = onChildChanged(target, (snapshot) => callback(snapshot.val()));
    return () => {
      added();
      changed();
    };
  }

  onDisconnectRemove(path: string): void {
    void onDisconnect(ref(this.database, path)).remove();
  }

  async onDisconnectSet(path: string, value: unknown): Promise<void> {
    await onDisconnect(ref(this.database, path)).set(value);
  }

  async cancelOnDisconnect(path: string): Promise<void> {
    await onDisconnect(ref(this.database, path)).cancel();
  }

  async getServerTimeOffset(): Promise<number> {
    const snapshot = await get(ref(this.database, ".info/serverTimeOffset"));
    return snapshot.exists() ? Number(snapshot.val()) : 0;
  }

  async remove(path: string): Promise<void> {
    await remove(ref(this.database, path));
  }

  async queryTop(path: string): Promise<Record<string, LeaderboardSubmission> | null> {
    const snapshot = await get(query(ref(this.database, path), orderByChild("floor"), limitToLast(5)));
    return snapshot.exists() ? snapshot.val() as Record<string, LeaderboardSubmission> : null;
  }

  serverTimestamp(): unknown {
    return serverTimestamp();
  }
}

export function createRealtimeDatabasePort(config: FirebaseConfig): RealtimeDatabasePort {
  const app = initializeApp(config);
  if (config.useEmulator) {
    connectDatabaseEmulator(getDatabase(app), "127.0.0.1", 9000);
    connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return new RealtimeDatabasePort(app);
}
