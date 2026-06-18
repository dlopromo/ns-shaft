export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

type Env = Record<string, string | undefined>;

const FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

export function generateRoomCode(random = Math.random): string {
  const value = Math.min(9999, Math.floor(Math.max(0, random()) * 10_000));
  return String(value).padStart(4, "0");
}

export function validateRoomCode(input: string): { ok: true; code: string } |
  { ok: false; reason: string } {
  const code = input.trim();
  if (/^\d{4}$/.test(code)) return { ok: true, code };
  return { ok: false, reason: "Room code must be 4 digits" };
}

export function buildFirebaseConfig(env: Env): FirebaseConfig {
  const missing = FIREBASE_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Firebase env: ${missing.join(", ")}`);
  }
  return {
    apiKey: env.VITE_FIREBASE_API_KEY!,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL!,
    projectId: env.VITE_FIREBASE_PROJECT_ID!,
    appId: env.VITE_FIREBASE_APP_ID!
  };
}
