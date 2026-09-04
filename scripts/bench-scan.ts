/**
 * Times each stage of the real scan pipeline over N Gmail messages.
 * Run: npx tsx scripts/bench-scan.ts [count] [concurrency]
 */
import { prisma } from "@/server/db";
import { getGmailClient } from "@/server/gmail/client";
import { fetchRawMessage } from "@/server/gmail/fetchRaw";
import { listMessageIds } from "@/server/gmail/list";
import { parseEmail } from "@/server/mail/parse";
import { loadUserSettings, persistAnalyzedEmail } from "@/server/scan/persist";

const COUNT = Number(process.argv[2] ?? 100);
const CONCURRENCY = Number(process.argv[3] ?? 8);

const stages: Record<string, number[]> = {
  fetch: [],
  parse: [],
  "analyze+persist": [],
  total: [],
};

function record(name: string, ms: number) {
  (stages[name] ??= []).push(ms);
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    return await fn();
  } finally {
    record(name, Date.now() - t);
  }
}

function stat(xs: number[]) {
  if (!xs.length) return "n/a";
  const s = [...xs].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return `n=${s.length} sum=${(sum / 1000).toFixed(1)}s mean=${Math.round(sum / s.length)}ms p50=${p(0.5)}ms p95=${p(0.95)}ms max=${s[s.length - 1]}ms`;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { accounts: { some: { provider: "google" } } },
    orderBy: { id: "asc" },
  });
  if (!user) throw new Error("no google-linked user");

  const settings = await loadUserSettings(user.id);
  const gmail = await getGmailClient(user.id);
  const ids = await listMessageIds(gmail, { max: COUNT, windowDays: 90 });
  console.log(`user=${user.id} messages=${ids.length} concurrency=${CONCURRENCY}`);
  console.log(`llm=${settings.enableLlm ? "on" : "off"}\n`);

  const started = Date.now();
  let i = 0;
  let failed = 0;
  const errors = new Map<string, number>();

  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      const t = Date.now();
      try {
        const raw = await timed("fetch", () => fetchRawMessage(gmail, id));
        const parsed = await timed("parse", () =>
          parseEmail(raw.raw, raw.snippet ?? undefined),
        );
        await timed("analyze+persist", () =>
          persistAnalyzedEmail({
            userId: user!.id,
            scanJobId: null,
            source: "gmail",
            externalId: id,
            parsed,
            sentAtHint: raw.internalDate,
            settings,
          }),
        );
        record("total", Date.now() - t);
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 90) : String(e);
        errors.set(msg, (errors.get(msg) ?? 0) + 1);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
  );

  const wall = Date.now() - started;
  console.log("--- per-stage (analysis only, no DB writes) ---");
  for (const [k, v] of Object.entries(stages)) console.log(k.padEnd(9), stat(v));
  console.log(
    `\nwall=${(wall / 1000).toFixed(1)}s for ${ids.length - failed} ok / ${failed} failed` +
      ` → ${Math.round(wall / Math.max(1, ids.length - failed))}ms per email` +
      ` (${((ids.length - failed) / (wall / 1000)).toFixed(1)}/s)`,
  );
  for (const [m, n] of [...errors.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ERR x${n}: ${m}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
