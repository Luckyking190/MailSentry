import type { EmailSource } from "@prisma/client";

import { prisma } from "@/server/db";
import { runPipeline } from "@/server/detect/pipeline";
import { getDomainReputation } from "@/server/intel/reputation";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import { geolocateMany } from "@/server/intel/geoip";
import type { ParsedEmail } from "@/server/mail/types";

export type SettingsInput = {
  detectorWeights: unknown;
  bandThresholds: unknown;
  brandWatchlist: string[];
  enableLlm: boolean;
};

export type PersistParams = {
  userId: string;
  scanJobId: string | null;
  source: EmailSource;
  /** Gmail message id, or a stable synthetic id for non-Gmail sources. */
  externalId: string;
  parsed: ParsedEmail;
  sentAtHint?: Date | null;
  settings: SettingsInput;
};

/**
 * Run the detection pipeline over one parsed email and persist everything:
 * the EmailRecord, AnalysisResult + Signals, enriched UrlMeta/AttachmentMeta,
 * the domain-reputation cache, and per-hop GeoIntel. Shared by the Gmail scan
 * worker and the demo-mailbox loader so both go through identical scoring.
 */
export async function persistAnalyzedEmail(
  p: PersistParams,
): Promise<{ emailId: string; band: string }> {
  const { userId, scanJobId, source, externalId, parsed, settings } = p;

  const outcome = await runPipeline({ email: parsed, userId, settings });

  const email = await prisma.emailRecord.upsert({
    where: {
      userId_source_gmailId: { userId, source, gmailId: externalId },
    },
    create: {
      userId,
      scanJobId,
      source,
      gmailId: externalId,
      messageIdHdr: parsed.messageIdHdr,
      fromAddress: parsed.fromAddress,
      fromDisplay: parsed.fromDisplay,
      senderDomain: parsed.senderDomain,
      replyTo: parsed.replyTo,
      returnPath: parsed.returnPath,
      toAddresses: parsed.toAddresses,
      subject: parsed.subject,
      sentAt: parsed.sentAt ?? p.sentAtHint ?? null,
      receivedAt: p.sentAtHint ?? parsed.sentAt ?? null,
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

  const analysisWrite = prisma.$transaction([
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

  const artifactsWrite = prisma.$transaction([
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

  // Both writes are scoped by emailId and touch disjoint tables.
  await Promise.all([analysisWrite, artifactsWrite]);

  // Independent cache/enrichment writes — run concurrently rather than
  // serially (each is its own DNS/HTTP round trip).
  await Promise.all([
    getDomainReputation(parsed.senderDomain).catch(() => {}),
    persistGeoIntel(email.id, parsed.receivedChain).catch(() => {}),
  ]);

  return { emailId: email.id, band: outcome.band };
}

async function persistGeoIntel(
  emailId: string,
  receivedHeaders: string[],
): Promise<void> {
  const { hops, originHop } = analyzeReceivedChain(receivedHeaders);
  const publicHops = hops.filter((h) => h.isPublicIp && h.fromIp);
  if (publicHops.length === 0) return;

  const geos = await geolocateMany(publicHops.map((h) => h.fromIp!));

  await prisma.$transaction([
    prisma.geoIntel.deleteMany({ where: { emailId } }),
    prisma.geoIntel.createMany({
      data: publicHops.map((h) => {
        const g = geos.get(h.fromIp!);
        return {
          emailId,
          hopIndex: h.index,
          ip: h.fromIp!,
          isTrustedOrigin: originHop?.index === h.index,
          ptr: g?.ptr ?? null,
          country: g?.country ?? null,
          region: g?.region ?? null,
          city: g?.city ?? null,
          lat: g?.lat ?? null,
          lon: g?.lon ?? null,
          asn: g?.asn ?? null,
          org: g?.org ?? null,
          timestamp: h.timestamp,
          byHost: h.byHost,
          fromHost: h.fromHost,
          provider: g?.provider ?? "unknown",
        };
      }),
    }),
  ]);
}

export async function loadUserSettings(userId: string): Promise<SettingsInput> {
  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return {
    detectorWeights: row.detectorWeights,
    bandThresholds: row.bandThresholds,
    brandWatchlist: row.brandWatchlist,
    enableLlm: row.enableLlm,
  };
}
