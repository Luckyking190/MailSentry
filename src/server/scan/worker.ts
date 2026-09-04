import type { ScanJob } from "@prisma/client";

import { prisma } from "@/server/db";
import { getGmailClient } from "@/server/gmail/client";
import { fetchRawMessage } from "@/server/gmail/fetchRaw";
import { parseEmail } from "@/server/mail/parse";
import { runPipeline } from "@/server/detect/pipeline";
import { getDomainReputation } from "@/server/intel/reputation";
import { toProgress, type ScanProgress } from "./job";

type SettingsInput = {
  detectorWeights: unknown;
  bandThresholds: unknown;
  brandWatchlist: string[];
  enableLlm: boolean;
};

const BATCH_SIZE = Math.max(1, Number(process.env.SCAN_BATCH_SIZE ?? 5));
const SOFT_TIME_BUDGET_MS = 40_000;

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

  const [gmail, settingsRow] = await Promise.all([
    getGmailClient(userId),
    prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
  ]);
  const settings: SettingsInput = {
    detectorWeights: settingsRow.detectorWeights,
    bandThresholds: settingsRow.bandThresholds,
    brandWatchlist: settingsRow.brandWatchlist,
    enableLlm: settingsRow.enableLlm,
  };

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
  const outcome = await runPipeline({ email: parsed, userId, settings });

  const email = await prisma.emailRecord.upsert({
    where: {
      userId_source_gmailId: { userId, source: "gmail", gmailId },
    },
    create: {
      userId,
      scanJobId,
      source: "gmail",
      gmailId,
      messageIdHdr: parsed.messageIdHdr,
      fromAddress: parsed.fromAddress,
      fromDisplay: parsed.fromDisplay,
      senderDomain: parsed.senderDomain,
      replyTo: parsed.replyTo,
      returnPath: parsed.returnPath,
      toAddresses: parsed.toAddresses,
      subject: parsed.subject,
      sentAt: parsed.sentAt ?? rawMsg.internalDate,
      receivedAt: rawMsg.internalDate,
      snippet: parsed.snippet,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      rawHeaders: parsed.headers,
      hasAttachments: parsed.hasAttachments,
    },
    update: {
      scanJobId,
      subject: parsed.subject,
      senderDomain: parsed.senderDomain,
      fromDisplay: parsed.fromDisplay,
      hasAttachments: parsed.hasAttachments,
    },
  });

  await prisma.$transaction([
    prisma.analysisResult.deleteMany({ where: { emailId: email.id } }),
    prisma.analysisResult.create({
      data: {
        emailId: email.id,
        score: outcome.score,
        band: outcome.band,
        categories: outcome.categories,
        summary: outcome.summary,
        engineVersion: outcome.engineVersion,
        llmModel: outcome.llmModel ?? null,
        llmDegraded: outcome.llmDegraded ?? false,
        signals: {
          create: outcome.signals.map((s) => ({
            detectorId: s.detectorId,
            category: s.category,
            triggered: s.triggered,
            rawScore: s.score,
            confidence: s.confidence,
            weight: s.weight,
            contribution: s.contribution,
            severity: s.severity,
            evidence: s.evidence,
            tags: s.tags ?? [],
          })),
        },
      },
    }),
  ]);

  // Persist enriched URL / attachment rows produced by the pipeline.
  const urlRows = outcome.artifacts.urls.length
    ? outcome.artifacts.urls
    : parsed.urls.slice(0, 50).map((u) => ({
        rawUrl: u.rawUrl,
        finalUrl: null,
        host: u.host,
        scheme: u.scheme,
        anchorText: u.anchorText,
        anchorMismatch: false,
        isShortener: false,
        isPunycode: false,
        redirectChain: [] as unknown[],
        lengthScore: null,
        entropyScore: null,
        domainAgeDays: null,
        verdict: null,
      }));
  const attRows = outcome.artifacts.attachments.length
    ? outcome.artifacts.attachments
    : parsed.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        extension: a.extension,
        isHighRisk: false,
        isDoubleExt: false,
        isArchive: false,
      }));

  await prisma.$transaction([
    prisma.urlMeta.deleteMany({ where: { emailId: email.id } }),
    prisma.attachmentMeta.deleteMany({ where: { emailId: email.id } }),
    ...(urlRows.length
      ? [
          prisma.urlMeta.createMany({
            data: urlRows.slice(0, 50).map((u) => ({
              emailId: email.id,
              rawUrl: u.rawUrl,
              finalUrl: u.finalUrl ?? null,
              host: u.host ?? null,
              scheme: u.scheme ?? null,
              anchorText: u.anchorText ?? null,
              anchorMismatch: u.anchorMismatch ?? false,
              isShortener: u.isShortener ?? false,
              isPunycode: u.isPunycode ?? false,
              redirectChain: (u.redirectChain ?? []) as object,
              lengthScore: u.lengthScore ?? null,
              entropyScore: u.entropyScore ?? null,
              domainAgeDays: u.domainAgeDays ?? null,
              verdict: u.verdict ?? null,
            })),
          }),
        ]
      : []),
    ...(attRows.length
      ? [
          prisma.attachmentMeta.createMany({
            data: attRows.map((a) => ({
              emailId: email.id,
              filename: a.filename,
              contentType: a.contentType ?? null,
              sizeBytes: a.sizeBytes ?? null,
              extension: a.extension ?? null,
              isHighRisk: a.isHighRisk ?? false,
              isDoubleExt: a.isDoubleExt ?? false,
              isArchive: a.isArchive ?? false,
            })),
          }),
        ]
      : []),
  ]);

  // Populate the shared domain-reputation cache (best effort; cached).
  await getDomainReputation(parsed.senderDomain).catch(() => {});

  return outcome.band;
}

export type { ScanJob };
