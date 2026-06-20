import type { Difficulty } from "./types";
import { normalizePlayerName } from "./player-name";

export type LeaderboardMode = "solo" | "local2p" | "coop" | "race";

export interface LeaderboardSubmission {
  uid: string;
  player1: string;
  player2?: string;
  floor: number;
  createdAt: number;
}

export interface RankedLeaderboardEntry extends LeaderboardSubmission {
  id: string;
}

export interface LeaderboardRow {
  rank: number;
  player1: string;
  player2?: string;
  floor: number;
  layoutMode: "single" | "coop";
}

export function buildLeaderboardRows(
  mode: LeaderboardMode,
  entries: RankedLeaderboardEntry[]
): LeaderboardRow[] {
  const paired = mode === "coop" || mode === "local2p";
  return Array.from({ length: 5 }, (_, index) => {
    const entry = entries[index];
    return {
      rank: index + 1,
      player1: entry ? normalizePlayerName(entry.player1, "--------") : "--------",
      ...(paired ? {
        player2: entry?.player2
          ? normalizePlayerName(entry.player2, "--------")
          : "--------"
      } : {}),
      floor: entry?.floor ?? 0,
      layoutMode: paired ? "coop" : "single"
    };
  });
}

export interface LeaderboardSubmitResult {
  id: string;
  submitted: boolean;
}

export interface LeaderboardDatabasePort {
  ensureAuthenticated(): Promise<string>;
  set(path: string, value: unknown): Promise<void>;
  queryTop(path: string): Promise<Record<string, LeaderboardSubmission> | null>;
  serverTimestamp(): unknown;
}

export interface LeaderboardSubmissionInput {
  mode: LeaderboardMode;
  difficulty: Difficulty;
  player1: string;
  player2?: string;
  floor: number;
}

interface PendingLeaderboardSubmission extends LeaderboardSubmissionInput {
  id: string;
}

const PENDING_KEY = "ns-shaft-leaderboard-pending-v1";
const CACHE_KEY = "ns-shaft-leaderboard-cache-v1";

export function leaderboardPath(mode: LeaderboardMode, difficulty: Difficulty): string {
  return `ns-shaft/leaderboards/${mode}/${difficulty}`;
}

export function normalizeLeaderboardEntries(
  value: Record<string, LeaderboardSubmission> | null | undefined
): RankedLeaderboardEntry[] {
  return Object.entries(value ?? {})
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((left, right) => right.floor - left.floor || left.createdAt - right.createdAt)
    .slice(0, 5);
}

export function rankLeaderboardSubmission(
  entries: RankedLeaderboardEntry[],
  submissionId: string
): number | null {
  const index = entries.findIndex((entry) => entry.id === submissionId);
  return index < 0 ? null : index + 1;
}

export class FirebaseLeaderboard {
  constructor(
    private readonly database: LeaderboardDatabasePort,
    private readonly storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  async submit(input: LeaderboardSubmissionInput): Promise<LeaderboardSubmitResult> {
    const pending = this.normalizePending({ ...input, id: this.createId() });
    try {
      await this.write(pending);
      return { id: pending.id, submitted: true };
    } catch {
      this.savePending([...this.pending().filter((item) => item.id !== pending.id), pending]);
      return { id: pending.id, submitted: false };
    }
  }

  async retryPending(): Promise<number> {
    const remaining: PendingLeaderboardSubmission[] = [];
    let submitted = 0;
    for (const item of this.pending()) {
      try {
        await this.write(item);
        submitted += 1;
      } catch {
        remaining.push(item);
      }
    }
    this.savePending(remaining);
    return submitted;
  }

  async loadTop(mode: LeaderboardMode, difficulty: Difficulty): Promise<RankedLeaderboardEntry[]> {
    await this.database.ensureAuthenticated();
    const entries = normalizeLeaderboardEntries(
      await this.database.queryTop(leaderboardPath(mode, difficulty))
    );
    const cache = this.cache();
    cache[`${mode}/${difficulty}`] = entries;
    this.storage.setItem(CACHE_KEY, JSON.stringify(cache));
    return entries;
  }

  cachedTop(mode: LeaderboardMode, difficulty: Difficulty): RankedLeaderboardEntry[] {
    return this.cache()[`${mode}/${difficulty}`] ?? [];
  }

  cachedWorldRecord(mode: LeaderboardMode, difficulty: Difficulty): number {
    return this.cachedTop(mode, difficulty)[0]?.floor ?? 0;
  }

  private async write(item: PendingLeaderboardSubmission): Promise<void> {
    const uid = await this.database.ensureAuthenticated();
    const value: Record<string, unknown> = {
      uid,
      player1: item.player1,
      floor: item.floor,
      createdAt: this.database.serverTimestamp()
    };
    if (item.player2) value.player2 = item.player2;
    await this.database.set(`${leaderboardPath(item.mode, item.difficulty)}/${item.id}`, value);
  }

  private normalizePending(input: PendingLeaderboardSubmission): PendingLeaderboardSubmission {
    if (!Number.isInteger(input.floor) || input.floor < 1 || input.floor > 9999) {
      throw new Error("Leaderboard floor must be an integer from 1 to 9999");
    }
    return {
      ...input,
      player1: normalizePlayerName(input.player1, "PLAYER1"),
      ...(input.player2 === undefined ? {} : {
        player2: normalizePlayerName(input.player2, "PLAYER2")
      })
    };
  }

  private pending(): PendingLeaderboardSubmission[] {
    return this.readJson<PendingLeaderboardSubmission[]>(PENDING_KEY, []);
  }

  private savePending(value: PendingLeaderboardSubmission[]): void {
    this.storage.setItem(PENDING_KEY, JSON.stringify(value));
  }

  private cache(): Record<string, RankedLeaderboardEntry[]> {
    return this.readJson<Record<string, RankedLeaderboardEntry[]>>(CACHE_KEY, {});
  }

  private readJson<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(this.storage.getItem(key) ?? "") as T;
    } catch {
      return fallback;
    }
  }
}
