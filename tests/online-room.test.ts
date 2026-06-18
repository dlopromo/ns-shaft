import { describe, expect, test } from "vitest";
import {
  buildFirebaseConfig,
  generateRoomCode,
  validateRoomCode
} from "../src/game/online/room";

describe("online room primitives", () => {
  test("generates six digit room codes with leading zeroes", () => {
    expect(generateRoomCode(() => 0)).toBe("000000");
    expect(generateRoomCode(() => 0.000042)).toBe("000042");
    expect(generateRoomCode(() => 0.999999)).toBe("999999");
    expect(generateRoomCode(() => 1)).toBe("999999");
  });

  test("accepts only six numeric digits as room codes", () => {
    expect(validateRoomCode("042917")).toEqual({ ok: true, code: "042917" });
    expect(validateRoomCode(" 042917 ")).toEqual({ ok: true, code: "042917" });
    expect(validateRoomCode("42917")).toEqual({ ok: false, reason: "Room code must be 6 digits" });
    expect(validateRoomCode("04291A")).toEqual({ ok: false, reason: "Room code must be 6 digits" });
  });

  test("builds firebase config from Vite environment values", () => {
    const config = buildFirebaseConfig({
      VITE_FIREBASE_API_KEY: "api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
      VITE_FIREBASE_DATABASE_URL: "https://example.firebaseio.com",
      VITE_FIREBASE_PROJECT_ID: "project",
      VITE_FIREBASE_APP_ID: "app-id"
    });
    expect(config).toEqual({
      apiKey: "api-key",
      authDomain: "example.firebaseapp.com",
      databaseURL: "https://example.firebaseio.com",
      projectId: "project",
      appId: "app-id"
    });
  });

  test("reports missing firebase environment values without exposing secrets", () => {
    expect(() => buildFirebaseConfig({
      VITE_FIREBASE_API_KEY: "api-key",
      VITE_FIREBASE_PROJECT_ID: "project"
    })).toThrow("Missing Firebase env: VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_APP_ID");
  });
});
