import { prisma } from "@/server/db";
import { getGmailClient } from "@/server/gmail/client";
import { fetchRawMessage } from "@/server/gmail/fetchRaw";
import { parseEmail } from "@/server/mail/parse";
import { recordEngagement } from "@/server/priority";
import { persistAnalyzedEmail, loadUserSettings, type SettingsInput } from "./persist";
import { toProgress, type ScanProgress } from "./job";

// Per-email work is almost entirely I/O — Gmail fetch, DNS/SPF, Neon writes,
// and an occasional LLM call — so concurrency is bounded by the slowest
// dependency, not by CPU. The LLM layer caps itself separately (see
// FEATHERLESS_MAX_CONCURRENCY), so this only governs fetch/DNS/DB overlap.
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY ?? 16));
/** How many completions to accumulate before writing progress back to the DB. */
const PROGRESS_EVERY = 8;
// Only decides how long the client waits between progress updates; throughput
// is set by CONCURRENCY. 40s meant the bar sat frozen for over a minute.
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

  const queue = [...((job.messageQueue as string[]) ?? [])];
  const histogram: Record<string, number> = {
    ...((job.bandHistogram as Record<string, number>) ?? {}),
  };
  let processed = job.processed;
  let failed = job.failed;

  const [gmail, settings] = await Promise.all([
    getGmailClient(userId),
    loadUserSettings(userId),
  ]);

  // A sliding pool, not fixed batches. Per-email cost is very uneven (a
  // message with links and a cold RDAP lookup can take 20x the median), and a
  // batch barrier made every worker wait on the slowest member of its group.
  // Here a finished worker takes the next id immediately.
  const inProgress = new Set<string>();
  let sinceFlush = 0;
  // Engagement is folded in once per tick rather than per message: these are
  // increments, so batching them keeps a re-run from inflating the counters
  // and saves a write per email.
  const engagement: { senderDomain: string; isUnread: boolean; isStarred: boolean }[] = [];

  const flush = async () => {
    sinceFlush = 0;
    job = await prisma.scanJob.update({
      where: { id: job!.id },
      data: {
        // Anything still in flight stays on the persisted queue, so a crash
        // mid-tick resumes it. Upserts make re-processing a no-op. By the
        // final flush every pump has drained, so this is just `queue`.
        messageQueue: [...queue, ...inProgress],
        processed,
        failed,
        bandHistogram: histogram,
        phase: queue.length || inProgress.size ? "ANALYZING" : "DONE",
        finishedAt: queue.length || inProgress.size ? null : new Date(),
      },
    });
  };

  const outOfTime = () => Date.now() - started >= SOFT_TIME_BUDGET_MS;

  async function pump() {
    while (queue.length > 0 && !outOfTime()) {
      const id = queue.shift()!;
      inProgress.add(id);
      try {
        const { band, engagement: e } = await processOne(
          userId,
          job!.id,
          gmail,
          settings,
          id,
        );
        processed += 1;
        histogram[band] = (histogram[band] ?? 0) + 1;
        engagement.push(e);
      } catch {
        failed += 1;
      } finally {
        inProgress.delete(id);
      }
      if (++sinceFlush >= PROGRESS_EVERY) await flush();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, pump),
  );

  await flush();
  // After the queue drains, so a slow counter write never delays results.
  await recordEngagement(userId, engagement).catch(() => {});
  return toProgress(job);
}

async function processOne(
  userId: string,
  scanJobId: string,
  gmail: Awaited<ReturnType<typeof getGmailClient>>,
  settings: SettingsInput,
  gmailId: string,
): Promise<{
  band: string;
  engagement: { senderDomain: string; isUnread: boolean; isStarred: boolean };
}> {
  const rawMsg = await fetchRawMessage(gmail, gmailId);
  const parsed = await parseEmail(rawMsg.raw, rawMsg.snippet ?? undefined);

  const labels = {
    labelIds: rawMsg.labelIds,
    // Gmail removes UNREAD the moment a message is opened, so its absence is
    // the "the user read this" signal the priority index learns from.
    isUnread: rawMsg.labelIds.includes("UNREAD"),
    isImportant: rawMsg.labelIds.includes("IMPORTANT"),
    isStarred: rawMsg.labelIds.includes("STARRED"),
  };

  const { band } = await persistAnalyzedEmail({
    userId,
    scanJobId,
    source: "gmail",
    externalId: gmailId,
    parsed,
    sentAtHint: rawMsg.internalDate,
    settings,
    labels,
  });

  return {
    band,
    engagement: {
      senderDomain: parsed.senderDomain,
      isUnread: labels.isUnread,
      isStarred: labels.isStarred,
    },
  };
}
