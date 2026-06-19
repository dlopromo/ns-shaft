import { describe, expect, test } from "vitest";
import {
  buildFirebaseConfig,
  generateRoomCode,
  validateRoomCode
} from "../src/game/online/room";

describe("online room primitives", () => {
  test("generates four digit room codes with leading zeroes", () => {
    expect(generateRoomCode(() => 0)).toBe("0000");
    expect(generateRoomCode(() => 0.0042)).toBe("0042");
    expect(generateRoomCode(() => 0.9999)).toBe("9999");
    expect(generateRoomCode(() => 1)).toBe("9999");
  });

  test("accepts only four numeric digits as room codes", () => {
    expect(validateRoomCode("0429")).toEqual({ ok: true, code: "0429" });
    expect(validateRoomCode(" 0429 ")).toEqual({ ok: true, code: "0429" });
    expect(validateRoomCode("429")).toEqual({ ok: false, reason: "Room code must be 4 digits" });
    expect(validateRoomCode("042A")).toEqual({ ok: false, reason: "Room code must be 4 digits" });
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
