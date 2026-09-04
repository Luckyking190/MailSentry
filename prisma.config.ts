import { defineConfig } from "prisma/config";

// Prisma CLI only auto-loads `.env` — Next.js's convention is `.env.local`.
// Node 24 has a built-in loader, so no extra dependency is needed. On Vercel
// (and CI) there is no .env.local file — env vars are injected directly —
// so a missing file here is expected and safe to ignore.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local (e.g. Vercel/CI) — env vars are already in process.env */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
