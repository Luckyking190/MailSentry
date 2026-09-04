/** Measures Neon round-trip latency and how it scales with concurrency. */
import { prisma } from "@/server/db";

async function probe(concurrency: number, perWorker = 10) {
  const lat: number[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let i = 0; i < perWorker; i++) {
        const t = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        lat.push(Date.now() - t);
      }
    }),
  );
  const s = lat.sort((a, b) => a - b);
  const mean = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  return `c=${String(concurrency).padStart(2)} mean=${String(mean).padStart(4)}ms p50=${s[Math.floor(s.length / 2)]}ms p95=${s[Math.floor(s.length * 0.95)]}ms max=${s[s.length - 1]}ms`;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(
    "pooler:", /-pooler\./.test(url),
    "| connection_limit:", /connection_limit=(\d+)/.exec(url)?.[1] ?? "(default)",
    "| pgbouncer:", /pgbouncer=true/.test(url),
  );
  await prisma.$queryRaw`SELECT 1`; // warm
  for (const c of [1, 4, 8, 16, 32]) console.log(await probe(c));
  await prisma.$disconnect();
}

main();
