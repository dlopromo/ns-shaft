import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/ns-shaft/" : "/",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
