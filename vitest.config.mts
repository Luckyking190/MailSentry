import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Dummy DB target so `new PrismaClient()` doesn't throw at import time
      // in tests that transitively touch @/server/db (e.g. the golden test).
      // Every intel/db call is wrapped in try/catch and degrades gracefully.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?connect_timeout=1",
      DIRECT_URL: "postgresql://test:test@localhost:5432/test?connect_timeout=1",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
