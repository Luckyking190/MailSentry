import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, RiskBand } from "@prisma/client";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { EmptyState } from "@/components/PageHeader";
import { Filters, type FilterValues } from "@/components/Filters";
import { Icon } from "@/components/Icon";
import { ThreatTabs } from "@/components/forensics/ThreatTabs";
import { DomainCard, type DomainCardData } from "@/components/forensics/DomainCard";
import { OriginLocations } from "@/components/OriginLocations";
import { BAND_ORDER, SIGNAL_CATEGORIES } from "@/lib/scoring";

export const metadata: Metadata = { title: "Domain Forensics" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type Evidence = { label?: string; value?: string };

/** Pull a named evidence value out of a signal's evidence array. */
function ev(evidence: unknown, label: RegExp): string | null {
  if (!Array.isArray(evidence)) return null;
  for (const e of evidence as Evidence[]) {
    if (e?.label && label.test(e.label) && e.value) return e.value;
  }
  return null;
}

/**
 * Condense the stored headers into the few lines that matter forensically —
 * the routing hop, the originating IP, and what the provider concluded.
 */
function headerSnippet(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const want = [
    "received",
    "x-originating-ip",
    "authentication-results",
    "received-spf",
    "return-path",
  ];
  const lines: string[] = [];
  for (const key of want) {
    const hit = Object.keys(h).find((k) => k.toLowerCase() === key);
    if (!hit) continue;
    const val = Array.isArray(h[hit]) ? (h[hit] as string[])[0] : h[hit];
    if (typeof val !== "string") continue;
    const name = hit.replace(/(^|-)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    lines.push(`${name}: ${val.replace(/\s+/g, " ").slice(0, 150)}`);
  }
  return lines.length ? lines.join("\n") : null;
}

export default async function MailPage(props: PageProps<"/mail">) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await props.searchParams;

  const q = one(sp.q)?.trim();
  const domain = one(sp.domain)?.trim().toLowerCase();
  const category = one(sp.category);
  const band = one(sp.band);
  const since = one(sp.since);

  const where: Prisma.EmailRecordWhereInput = { userId };
  if (domain) where.senderDomain = { contains: domain, mode: "insensitive" };
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
    ];
  }
  if (since) {
    const days = Number(since);
    if (Number.isFinite(days) && days > 0) {
      // eslint-disable-next-line react-hooks/purity -- request-time cutoff for a server-rendered filter, not memoized
      where.sentAt = { gte: new Date(Date.now() - days * 86_400_000) };
    }
  }
  const analysisWhere: Prisma.AnalysisResultWhereInput = {};
  if (band && (BAND_ORDER as string[]).includes(band)) analysisWhere.band = band as RiskBand;
  if (category && (SIGNAL_CATEGORIES as readonly string[]).includes(category)) {
    analysisWhere.categories = { has: category };
  }
  if (Object.keys(analysisWhere).length) where.analysis = { is: analysisWhere };

  const [emails, totalCount, byCountry, byPoint] = await Promise.all([
    prisma.emailRecord.findMany({
      where,
      // Everything a forensic card renders, and nothing that would drag the
      // 32KB body or 64KB HTML across the wire.
      select: {
        id: true,
        subject: true,
        senderDomain: true,
        fromAddress: true,
        rawHeaders: true,
        analysis: {
          select: {
            band: true,
            score: true,
            signals: {
              where: { triggered: true },
              select: {
                detectorId: true,
                severity: true,
                contribution: true,
                evidence: true,
              },
            },
          },
        },
        geoIntel: {
          where: { isTrustedOrigin: true },
          select: { ip: true, city: true, country: true, asn: true, org: true },
          take: 1,
        },
        attachments: {
          where: { isHighRisk: true },
          select: { filename: true, extension: true, isDoubleExt: true },
          take: 1,
        },
        urls: {
          where: {
            OR: [{ isShortener: true }, { isPunycode: true }, { anchorMismatch: true }],
          },
          select: { host: true, isShortener: true, anchorMismatch: true },
          take: 1,
        },
      },
      orderBy: [{ priorityScore: { sort: "desc", nulls: "last" } }, { sentAt: "desc" }],
      take: 120,
    }),
    prisma.emailRecord.count({ where: { userId } }),
    prisma.geoIntel.groupBy({
      by: ["country"],
      where: { isTrustedOrigin: true, country: { not: null }, email: { userId } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 6,
    }),
    prisma.geoIntel.groupBy({
      by: ["lat", "lon", "city", "country"],
      where: {
        isTrustedOrigin: true,
        lat: { not: null },
        lon: { not: null },
        email: { userId },
      },
      _count: { _all: true },
      orderBy: { _count: { lat: "desc" } },
      take: 300,
    }),
  ]);

  // One card per sender domain, represented by its worst-scoring message.
  const groups = new Map<string, typeof emails>();
  for (const e of emails) {
    const list = groups.get(e.senderDomain) ?? [];
    list.push(e);
    groups.set(e.senderDomain, list);
  }

  const reps = await prisma.domainReputation.findMany({
    where: { domain: { in: [...groups.keys()] } },
    select: { domain: true, domainAgeDays: true, registrar: true, lookalikeOf: true },
  });
  const repByDomain = new Map(reps.map((r) => [r.domain, r]));

  const cards: DomainCardData[] = [...groups.entries()]
    .map(([dom, list]) => {
      const worst = [...list].sort(
        (a, b) => (b.analysis?.score ?? 0) - (a.analysis?.score ?? 0),
      )[0];
      const signals = worst.analysis?.signals ?? [];
      const spfSig = signals.find((s) => s.detectorId === "auth.spf");
      const dkimSig = signals.find((s) => s.detectorId === "auth.dkim-dmarc");
      const rep = repByDomain.get(dom);

      // Highest-contributing non-auth signal is the "vector" the card names.
      const top = [...signals]
        .filter((s) => !s.detectorId.startsWith("auth."))
        .sort((a, b) => b.contribution - a.contribution)[0];

      const att = worst.attachments[0];
      const url = worst.urls[0];

      const vector = att
        ? {
            title: att.filename,
            detail: att.isDoubleExt
              ? `Double extension (.${att.extension})`
              : `High-risk attachment (.${att.extension})`,
            note: null,
          }
        : url
          ? {
              title: url.isShortener ? "Shortened URL" : "Suspicious link",
              detail: url.host,
              note: url.anchorMismatch ? "Anchor text does not match href" : null,
            }
          : top
            ? { title: top.detectorId, detail: ev(top.evidence, /.*/), note: null }
            : null;

      return {
        domain: dom,
        band: (worst.analysis?.band ?? "SAFE") as RiskBand,
        score: worst.analysis?.score ?? 0,
        count: list.length,
        emailId: worst.id,
        subject: worst.subject,
        fromAddress: worst.fromAddress,
        origin: worst.geoIntel[0] ?? null,
        auth: {
          // A detector only emits a signal when it fires, so the absence of one
          // means the check passed rather than that the result is unknown.
          spf: ev(spfSig?.evidence, /^SPF result$/i)?.split(" —")[0] ?? "pass",
          dkim: dkimSig ? (ev(dkimSig.evidence, /^DKIM$/i) ? "fail" : "none") : "pass",
          dmarc: dkimSig
            ? (ev(dkimSig.evidence, /^DMARC$/i)?.split(" ")[0] ?? "none")
            : "pass",
        },
        domainAgeDays: rep?.domainAgeDays ?? null,
        registrar: rep?.registrar ?? null,
        lookalikeOf: rep?.lookalikeOf ?? null,
        vector,
        rawHeaderSnippet: headerSnippet(worst.rawHeaders),
      } satisfies DomainCardData;
    })
    .sort((a, b) => b.score - a.score);

  const threatCards = cards.filter((c) =>
    ["MEDIUM", "HIGH", "CRITICAL"].includes(c.band),
  );
  const cleanCards = cards.filter((c) => ["SAFE", "LOW"].includes(c.band));

  const geoTotal = byCountry.reduce((n, r) => n + r._count._all, 0);
  const originPoints = byPoint.map((p) => ({
    lat: p.lat!,
    lon: p.lon!,
    city: p.city,
    country: p.country,
    count: p._count._all,
  }));
  const countryRows = byCountry.map((r) => ({ country: r.country, count: r._count._all }));

  const filterValues: FilterValues = { q, domain, category, band, since };

  const list = (items: DomainCardData[], emptyText: string) =>
    items.length === 0 ? (
      <EmptyState>{emptyText}</EmptyState>
    ) : (
      <div className="flex flex-col gap-space-lg">
        {items.map((c) => (
          <DomainCard key={c.domain} d={c} />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col gap-space-2xs pb-space-sm">
        <div className="flex flex-wrap items-center gap-space-xs text-on-surface-variant">
          <Icon name="radar" className="text-[16px]" />
          <span className="t-mono-sm uppercase tracking-wider text-primary">
            Forensic Signal Triage / Telemetry Engine
          </span>
          <span className="text-on-surface-variant/40">/</span>
          <span className="t-mono-sm text-on-surface-variant">
            {groups.size} DOMAINS · {totalCount} MESSAGES
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <h2 className="t-headline-lg font-bold tracking-tight text-on-surface">
            Domain Threat Forensics &amp; Geolocation
          </h2>
          <span className="t-mono-sm rounded-full bg-surface-high px-space-xs py-0.5 font-semibold uppercase text-primary">
            Real-Time Ingestion
          </span>
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyState>
          No emails yet. Run a scan or load the demo mailbox from the{" "}
          <Link href="/scan" className="text-primary-container underline">
            scan screen
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <Filters values={filterValues} action="/mail" />

          <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
            <div className="flex flex-col xl:col-span-8">
              <ThreatTabs
                threatCount={threatCards.length}
                cleanCount={cleanCards.length}
                threats={list(
                  threatCards,
                  "No domains scored medium or above — nothing in the threat vault.",
                )}
                clean={list(cleanCards, "No clean domains match those filters.")}
              />
            </div>

            <div className="flex flex-col gap-space-lg xl:col-span-4">
              <div className="elev-2 flex flex-col gap-space-md rounded-xl bg-surface-low p-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <Icon name="map" className="text-[16px] text-primary" />
                    <span className="t-mono-md font-bold text-on-surface">
                      Geolocation Intercept Grid
                    </span>
                  </div>
                  <span className="flex items-center gap-1 t-mono-sm text-secondary">
                    <span className="size-1.5 animate-pulse rounded-full bg-secondary" />
                    Live nodes
                  </span>
                </div>
                <OriginLocations rows={countryRows} points={originPoints} total={geoTotal} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
