import { prisma } from "@/server/db";
import { getGmailClient } from "@/server/gmail/client";
import { fetchRawMessage } from "@/server/gmail/fetchRaw";
import { parseEmail } from "@/server/mail/parse";
import { persistAnalyzedEmail, loadUserSettings, type SettingsInput } from "./persist";
import { toProgress, type ScanProgress } from "./job";

// Per-email work is I/O-bound (Gmail fetch, DNS/SPF, optional LLM call) and
// the LLM layer already caps its own concurrency independently (see
// FEATHERLESS_MAX_CONCURRENCY), so a larger batch buys real parallelism for
// everything else (DNS/RDAP/geo) without over-subscribing the LLM budget.
const BATCH_SIZE = Math.max(1, Number(process.env.SCAN_BATCH_SIZE ?? 8));
// Throughput is set by BATCH_SIZE; this only decides how long the client
// waits between progress updates. 40s meant one tick chewed through several
// batches and the bar sat frozen for over a minute — same work, but it felt
// broken. Return after roughly one batch so progress actually moves.
const SOFT_TIME_BUDGET_MS = 12_000;

/**
 * Process message-queue items for a job until the queue is empty or the soft
 * time budget is hit. Idempotent: emails are upserted on (userId, source,
 * gmailId), so re-running a tick over the same ids is a no-op.
 */
export async function tickScan(
  userId: string,
  jobId: string,
): Promise<ScanProgress> {
  const started = Date.now();
  let job = await prisma.scanJob.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new Error("Scan job not found");
  if (job.phase === "DONE" || job.phase === "FAILED") return toProgress(job);

  let queue = (job.messageQueue as string[]) ?? [];
  const histogram: Record<string, number> = {
    ...((job.bandHistogram as Record<string, number>) ?? {}),
  };
  let processed = job.processed;
  let failed = job.failed;

  const [gmail, settings] = await Promise.all([
    getGmailClient(userId),
    loadUserSettings(userId),
  ]);

  while (queue.length > 0 && Date.now() - started < SOFT_TIME_BUDGET_MS) {
    const batch = queue.slice(0, BATCH_SIZE);
    queue = queue.slice(BATCH_SIZE);

    const outcomes = await Promise.allSettled(
      batch.map((id) => processOne(userId, job!.id, gmail, settings, id)),
    );

    for (const o of outcomes) {
      if (o.status === "fulfilled") {
        processed += 1;
        histogram[o.value] = (histogram[o.value] ?? 0) + 1;
      } else {
        failed += 1;
      }
    }

    job = await prisma.scanJob.update({
      where: { id: job.id },
      data: {
        messageQueue: queue,
        processed,
        failed,
        bandHistogram: histogram,
        phase: queue.length ? "ANALYZING" : "DONE",
        finishedAt: queue.length ? null : new Date(),
      },
    });
  }

  return toProgress(job);
}

async function processOne(
  userId: string,
  scanJobId: string,
  gmail: Awaited<ReturnType<typeof getGmailClient>>,
  settings: SettingsInput,
  gmailId: string,
): Promise<string> {
  const rawMsg = await fetchRawMessage(gmail, gmailId);
  const parsed = await parseEmail(rawMsg.raw, rawMsg.snippet ?? undefined);

  const { band } = await persistAnalyzedEmail({
    userId,
    scanJobId,
    source: "gmail",
    externalId: gmailId,
    parsed,
    sentAtHint: rawMsg.internalDate,
    settings,
  });

  return band;
}
