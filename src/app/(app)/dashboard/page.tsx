import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, RiskBand } from "@prisma/client";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { EmptyState } from "@/components/PageHeader";
import { RiskBadge } from "@/components/RiskBadge";
import { Filters, type FilterValues } from "@/components/Filters";
import { ScanRunner } from "@/components/ScanRunner";
import { NewMailWatcher } from "@/components/NewMailWatcher";
import { OriginLocations } from "@/components/OriginLocations";
import { Icon } from "@/components/Icon";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { BAND_ORDER, BAND_META, SIGNAL_CATEGORIES } from "@/lib/scoring";
import { DETECTOR_LABEL } from "@/lib/detectorLabels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const CIRCUMFERENCE = 2 * Math.PI * 42;

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await props.searchParams;

  const q = one(sp.q)?.trim();
  const domain = one(sp.domain)?.trim().toLowerCase();
  const category = one(sp.category);
  const band = one(sp.band);
  const since = one(sp.since);

  const [total, byBand, job, byCountry, byPoint, topSignals, triage] =
    await Promise.all([
      prisma.emailRecord.count({ where: { userId } }),
      prisma.analysisResult.groupBy({
        by: ["band"],
        where: { email: { userId } },
        _count: true,
      }),
      getActiveOrLatestJob(userId),
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
      // What is actually firing across the mailbox — the real "anomaly matrix",
      // in place of the mock's invented detection vectors.
      prisma.signal.groupBy({
        by: ["detectorId"],
        where: { triggered: true, analysis: { email: { userId } } },
        _count: { _all: true },
        orderBy: { _count: { detectorId: "desc" } },
        take: 6,
      }),
      prisma.emailRecord.findMany({
        where: { userId, analysis: { is: { band: { in: ["HIGH", "CRITICAL"] } } } },
        select: {
          id: true,
          subject: true,
          senderDomain: true,
          analysis: { select: { band: true, score: true } },
        },
        orderBy: { analysis: { score: "desc" } },
        take: 3,
      }),
    ]);

  const counts = Object.fromEntries(byBand.map((b) => [b.band, b._count]));
  const flagged = BAND_ORDER.filter((b) => b !== "SAFE" && b !== "LOW").reduce(
    (n, b) => n + (counts[b] ?? 0),
    0,
  );
  const clean = (counts.SAFE ?? 0) + (counts.LOW ?? 0);
  const critical = counts.CRITICAL ?? 0;

  // Threat-surface index: the share of the mailbox carrying medium-or-worse
  // findings, weighted so a critical result counts three times a suspicious one.
  const surfaceIndex = total
    ? Math.min(
        100,
        Math.round(
          (((counts.CRITICAL ?? 0) * 3 + (counts.HIGH ?? 0) * 2 + (counts.MEDIUM ?? 0)) /
            (total * 3)) *
            100,
        ),
      )
    : 0;
  const surfaceLabel =
    surfaceIndex >= 66 ? "Elevated" : surfaceIndex >= 33 ? "Guarded" : "Nominal";
  const surfaceTone =
    surfaceIndex >= 66 ? "text-error" : surfaceIndex >= 33 ? "text-medium" : "text-secondary";
  const surfaceStroke =
    surfaceIndex >= 66 ? "#ffb4ab" : surfaceIndex >= 33 ? "#f59e0b" : "#4edea3";

  const activeJob = job && !["DONE", "FAILED"].includes(job.phase) ? job : null;
  const hasFilters = !!(q || domain || category || band || since);

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
  if (band && (BAND_ORDER as string[]).includes(band)) {
    analysisWhere.band = band as RiskBand;
  }
  if (category && (SIGNAL_CATEGORIES as readonly string[]).includes(category)) {
    analysisWhere.categories = { has: category };
  }
  if (Object.keys(analysisWhere).length) where.analysis = { is: analysisWhere };

  const filtered = hasFilters
    ? await prisma.emailRecord.findMany({
        where,
        select: {
          id: true,
          subject: true,
          senderDomain: true,
          analysis: { select: { band: true, score: true } },
        },
        orderBy: { sentAt: "desc" },
        take: 30,
      })
    : [];

  const geoTotal = byCountry.reduce((n, r) => n + r._count._all, 0);
  const originPoints = byPoint.map((p) => ({
    lat: p.lat!,
    lon: p.lon!,
    city: p.city,
    country: p.country,
    count: p._count._all,
  }));
  const countryRows = byCountry.map((r) => ({ country: r.country, count: r._count._all }));
  const signalMax = Math.max(1, ...topSignals.map((s) => s._count._all));

  const filterValues: FilterValues = { q, domain, category, band, since };

  return (
    <div className="relative flex flex-col gap-space-lg">
      <div className="pointer-events-none absolute -left-10 -top-12 -z-10 size-96 rounded-full bg-primary/5 blur-3xl" />

      <div className="flex flex-col items-start justify-between gap-space-md pb-space-xs lg:flex-row lg:items-center">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs">
            <span className="t-mono-sm font-semibold uppercase tracking-wider text-primary">
              Real-Time Ingestion Buffer
            </span>
            <span className="size-1.5 animate-ping rounded-full bg-primary" />
          </div>
          <h2 className="t-headline-lg mt-space-2xs tracking-tight text-on-surface">
            Forensic Summary &amp; Pattern Analytics
          </h2>
        </div>
        <Link
          href="/mail"
          className="flex items-center gap-space-xs rounded-xl bg-primary-container px-space-md py-space-xs t-mono-md font-bold text-on-primary-container shadow-[0_0_16px_rgba(0,240,255,0.3)] transition-opacity hover:opacity-90"
        >
          <Icon name="security" className="text-[16px]" />
          <span>Open Domain Forensics</span>
        </Link>
      </div>

      {activeJob && <ScanRunner initial={toProgress(activeJob)} compact />}
      {!activeJob && <NewMailWatcher />}

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Ingested Mail"
          value={total.toLocaleString()}
          note="indexed"
          noteTone="text-secondary"
          icon="mark_email_read"
          iconTone="text-primary"
          barTone="bg-primary"
          pct={100}
        />
        <StatCard
          label="Safe & Verified"
          value={clean.toLocaleString()}
          note={total ? `${Math.round((clean / total) * 100)}%` : "0%"}
          noteTone="text-secondary"
          icon="verified"
          iconTone="text-secondary"
          barTone="bg-secondary"
          pct={total ? (clean / total) * 100 : 0}
        />
        <StatCard
          label="Flagged (Medium+)"
          value={flagged.toLocaleString()}
          note={total ? `${Math.round((flagged / total) * 100)}%` : "0%"}
          noteTone="text-medium"
          icon="gpp_maybe"
          iconTone="text-medium"
          barTone="bg-medium"
          pct={total ? (flagged / total) * 100 : 0}
        />
        <StatCard
          label="Critical Threat Vectors"
          value={critical.toLocaleString()}
          note={total ? `${Math.round((critical / total) * 100)}%` : "0%"}
          noteTone="text-error"
          icon="dangerous"
          iconTone="text-error"
          barTone="bg-error"
          pct={total ? (critical / total) * 100 : 0}
          alert
        />
      </div>

      {total === 0 ? (
        <EmptyState>
          No mail analyzed yet — run a scan or load the demo mailbox from the{" "}
          <Link href="/scan" className="text-primary-container underline">
            scan screen
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-space-md rounded-xl bg-surface-low p-space-md elev-2">
            <div className="flex items-center gap-space-xs">
              <Icon name="tune" className="text-[18px] text-primary" />
              <span className="t-mono-md font-bold uppercase text-primary">
                Multi-Dimensional Forensic Sieve
              </span>
            </div>
            <Filters values={filterValues} action="/dashboard" />
          </div>

          {hasFilters && (
            <div className="overflow-hidden rounded-xl bg-surface-low elev-2">
              {filtered.length === 0 ? (
                <p className="p-space-md t-mono-sm text-on-surface-variant">
                  No emails match those filters.
                </p>
              ) : (
                <ul className="divide-y divide-outline-variant/40">
                  {filtered.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/mail/${e.id}`}
                        className="flex items-center justify-between gap-3 px-space-md py-space-sm transition-colors hover:bg-surface-container"
                      >
                        <span className="t-body-md min-w-0 flex-1 truncate">
                          {e.subject || "(no subject)"}
                          <span className="ml-2 t-mono-sm text-on-surface-variant">
                            {e.senderDomain}
                          </span>
                        </span>
                        {e.analysis ? (
                          <RiskBadge band={e.analysis.band} score={e.analysis.score} />
                        ) : (
                          <span className="t-mono-sm text-on-surface-variant">pending</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12">
            <div className="flex flex-col gap-space-lg xl:col-span-8">
              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container p-space-lg elev-2">
                <div className="flex items-center gap-space-xs">
                  <Icon name="equalizer" className="text-[18px] text-primary" />
                  <span className="t-mono-md font-bold uppercase text-primary">
                    Risk Band Distribution
                  </span>
                </div>
                <div className="flex flex-col gap-space-sm">
                  {BAND_ORDER.map((bandKey) => {
                    const c = counts[bandKey] ?? 0;
                    const pct = total ? Math.round((c / total) * 100) : 0;
                    return (
                      <div key={bandKey} className="flex items-center gap-3 t-mono-sm">
                        <span className="w-16 shrink-0 text-on-surface-variant">
                          {BAND_META[bandKey].label}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-highest">
                          <span
                            className={`block h-full rounded-full ${BAND_META[bandKey].dot}`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-14 shrink-0 text-right tnum text-on-surface-variant">
                          {c}
                          <span className="ml-1 text-on-surface-variant/50">{pct}%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container p-space-lg elev-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <Icon name="scatter_plot" className="text-[18px] text-secondary" />
                    <span className="t-mono-md font-bold uppercase text-on-surface">
                      Heuristic Anomaly Matrix
                    </span>
                  </div>
                  <span className="t-mono-sm font-semibold text-secondary">
                    {topSignals.length} detectors firing
                  </span>
                </div>
                {topSignals.length === 0 ? (
                  <p className="py-space-md text-center t-mono-sm text-on-surface-variant">
                    No detectors have fired yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-space-sm">
                    {topSignals.map((s) => {
                      const n = s._count._all;
                      return (
                        <div key={s.detectorId} className="flex items-center gap-3 t-mono-sm">
                          <span className="w-48 shrink-0 truncate text-on-surface">
                            {DETECTOR_LABEL[s.detectorId] ?? s.detectorId}
                          </span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-highest">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-primary-container to-secondary"
                              style={{ width: `${(n / signalMax) * 100}%` }}
                            />
                          </span>
                          <span className="w-10 shrink-0 text-right tnum text-on-surface-variant">
                            {n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-space-lg xl:col-span-4">
              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container p-space-lg elev-2">
                <div className="flex items-center justify-between">
                  <span className="t-mono-sm font-bold uppercase tracking-wider text-primary">
                    Audit Diagnostic
                  </span>
                  <span
                    className={cn(
                      "rounded-lg px-space-xs py-space-2xs t-label-sm font-bold",
                      surfaceIndex >= 66
                        ? "bg-error-container/40 text-error"
                        : surfaceIndex >= 33
                          ? "bg-medium/15 text-medium"
                          : "bg-secondary/15 text-secondary",
                    )}
                  >
                    {surfaceLabel}
                  </span>
                </div>

                <div className="relative flex flex-col items-center justify-center rounded-xl bg-surface-lowest p-space-md">
                  <div className="relative flex size-40 items-center justify-center">
                    <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#262a35" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke={surfaceStroke}
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={CIRCUMFERENCE - (surfaceIndex / 100) * CIRCUMFERENCE}
                        strokeLinecap="round"
                        strokeWidth="8"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className={cn("t-headline-lg font-bold tracking-tight tnum", surfaceTone)}>
                        {surfaceIndex}
                      </span>
                      <span className="t-label-sm text-on-surface-variant">/100 index</span>
                    </div>
                  </div>
                  <div className="mt-space-sm text-center">
                    <span className="t-headline-sm font-semibold text-on-surface">
                      {surfaceLabel} Threat Surface
                    </span>
                    <p className="mt-space-2xs px-space-sm t-body-sm text-on-surface-variant">
                      Share of the mailbox carrying medium-or-worse findings, with
                      critical results weighted heaviest.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container p-space-lg elev-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <Icon name="campaign" className="text-[18px] text-error" />
                    <span className="t-mono-md font-bold uppercase text-on-surface">
                      Triage Queue
                    </span>
                  </div>
                  {triage.length > 0 && (
                    <span className="t-mono-sm font-bold text-error">Action needed</span>
                  )}
                </div>
                {triage.length === 0 ? (
                  <p className="py-space-md text-center t-mono-sm text-on-surface-variant">
                    Nothing scored high or critical. Queue is clear.
                  </p>
                ) : (
                  <div className="flex flex-col gap-space-sm">
                    {triage.map((e) => (
                      <Link
                        key={e.id}
                        href={`/mail/${e.id}`}
                        className="flex flex-col gap-space-xs rounded-xl bg-surface-high p-space-sm transition-colors hover:bg-surface-highest"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "rounded px-space-xs py-space-2xs t-label-sm",
                              e.analysis?.band === "CRITICAL"
                                ? "bg-error-container/40 text-error"
                                : "bg-medium/15 text-medium",
                            )}
                          >
                            {e.analysis?.band}
                          </span>
                          <span className="t-mono-sm tnum text-on-surface-variant">
                            {e.analysis?.score}/100
                          </span>
                        </div>
                        <span className="truncate t-mono-md font-semibold text-on-surface">
                          {e.subject || "(no subject)"}
                        </span>
                        <span className="truncate t-mono-sm text-on-surface-variant">
                          {e.senderDomain}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-space-md rounded-xl bg-surface-container p-space-lg elev-2">
                <div className="flex items-center gap-space-xs">
                  <Icon name="map" className="text-[18px] text-primary" />
                  <span className="t-mono-md font-bold uppercase text-on-surface">
                    Origin Geography
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

function StatCard({
  label,
  value,
  note,
  noteTone,
  icon,
  iconTone,
  barTone,
  pct,
  alert = false,
}: {
  label: string;
  value: string;
  note: string;
  noteTone: string;
  icon: string;
  iconTone: string;
  barTone: string;
  pct: number;
  alert?: boolean;
}) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container p-space-md elev-2">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="t-label-sm tracking-wider text-on-surface-variant">{label}</span>
          <div className="mt-space-xs flex items-baseline gap-space-xs">
            <span className={cn("t-headline-lg font-bold tnum", iconTone)}>{value}</span>
            <span className={cn("t-mono-sm", noteTone)}>{note}</span>
          </div>
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl bg-surface-high",
            iconTone,
          )}
        >
          <Icon name={icon} className="text-[20px]" />
        </div>
      </div>
      <div className="mt-space-md h-1 w-full overflow-hidden rounded-full bg-surface-highest">
        <div
          className={cn("h-full rounded-full", barTone, alert && pct > 0 && "animate-pulse")}
          style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}
