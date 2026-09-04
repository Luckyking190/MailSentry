import type { EmailSource, ScanJob } from "@prisma/client";

import { prisma } from "@/server/db";
import { getGmailClient } from "@/server/gmail/client";
import { listMessageIds } from "@/server/gmail/list";

const ACTIVE_PHASES = ["QUEUED", "LISTING", "FETCHING", "ANALYZING", "DOMAIN_INTEL"] as const;

export type ScanProgress = {
  jobId: string;
  phase: ScanJob["phase"];
  total: number;
  processed: number;
  failed: number;
  bandHistogram: Record<string, number>;
  done: boolean;
  error: string | null;
};

export function toProgress(job: ScanJob): ScanProgress {
  return {
    jobId: job.id,
    phase: job.phase,
    total: job.total,
    processed: job.processed,
    failed: job.failed,
    bandHistogram: (job.bandHistogram as Record<string, number>) ?? {},
    done: job.phase === "DONE" || job.phase === "FAILED",
    error: job.error,
  };
}

export async function getActiveOrLatestJob(
  userId: string,
  jobId?: string,
): Promise<ScanJob | null> {
  if (jobId) {
    return prisma.scanJob.findFirst({ where: { id: jobId, userId } });
  }
  return prisma.scanJob.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Create (or resume) a scan job and populate its message queue from Gmail.
 */
export async function startScan(
  userId: string,
  source: EmailSource = "gmail",
): Promise<ScanJob> {
  const existing = await prisma.scanJob.findFirst({
    where: { userId, phase: { in: [...ACTIVE_PHASES] } },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const job = await prisma.scanJob.create({
    data: { userId, source, phase: "LISTING" },
  });

  if (source !== "gmail") {
    // Demo source is populated by /api/demo/load (Phase 7).
    return job;
  }

  try {
    const gmail = await getGmailClient(userId);
    const ids = await listMessageIds(gmail, {
      max: settings.maxEmails,
      windowDays: settings.scanWindowDays,
    });

    return prisma.scanJob.update({
      where: { id: job.id },
      data: {
        phase: ids.length ? "ANALYZING" : "DONE",
        total: ids.length,
        messageQueue: ids,
        finishedAt: ids.length ? null : new Date(),
      },
    });
  } catch (err) {
    return prisma.scanJob.update({
      where: { id: job.id },
      data: {
        phase: "FAILED",
        error: err instanceof Error ? err.message : "Failed to list messages",
        finishedAt: new Date(),
      },
    });
  }
}
