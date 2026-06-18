import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  update,
  type Database
} from "firebase/database";
import type { FirebaseConfig } from "./room";
import type { OnlineDatabasePort } from "./session";

export class RealtimeDatabasePort implements OnlineDatabasePort {
  private readonly database: Database;

  constructor(app: FirebaseApp) {
    this.database = getDatabase(app);
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

  onDisconnectRemove(path: string): void {
    void onDisconnect(ref(this.database, path)).remove();
  }

  async getServerTimeOffset(): Promise<number> {
    const snapshot = await get(ref(this.database, ".info/serverTimeOffset"));
    return snapshot.exists() ? Number(snapshot.val()) : 0;
  }

  async remove(path: string): Promise<void> {
    await remove(ref(this.database, path));
  }
}

export function createRealtimeDatabasePort(config: FirebaseConfig): RealtimeDatabasePort {
  return new RealtimeDatabasePort(initializeApp(config));
}
