import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, RiskBand } from "@prisma/client";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";
import { Filters, type FilterValues } from "@/components/Filters";
import { ScanRunner } from "@/components/ScanRunner";
import { StatTile } from "@/components/StatTile";
import { NewMailWatcher } from "@/components/NewMailWatcher";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { BAND_ORDER, BAND_META, SIGNAL_CATEGORIES } from "@/lib/scoring";
import { countryFlag, countryName } from "@/lib/geo";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await props.searchParams;

  const q = one(sp.q)?.trim();
  const domain = one(sp.domain)?.trim().toLowerCase();
  const category = one(sp.category);
  const band = one(sp.band);
  const since = one(sp.since);

  const [total, byBand, job, byCountry] = await Promise.all([
    prisma.emailRecord.count({ where: { userId } }),
    prisma.analysisResult.groupBy({
      by: ["band"],
      where: { email: { userId } },
      _count: true,
    }),
    getActiveOrLatestJob(userId),
    // Where mail actually entered the internet from: one row per email, the
    // earliest *trusted* Received hop. Hops older than that are attacker-
    // controlled and would poison the ranking, so they are excluded here the
    // same way the SPF detector ignores them.
    prisma.geoIntel.groupBy({
      by: ["country"],
      where: { isTrustedOrigin: true, country: { not: null }, email: { userId } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 6,
    }),
  ]);

  const geoTotal = byCountry.reduce((n, r) => n + r._count._all, 0);

  // An unfinished job keeps ticking from here, so the dashboard is usable
  // while the rest of the mailbox is still being scored.
  const activeJob = job && !["DONE", "FAILED"].includes(job.phase) ? job : null;

  const counts = Object.fromEntries(byBand.map((b) => [b.band, b._count]));
  const flagged = BAND_ORDER.filter((b) => b !== "SAFE" && b !== "LOW").reduce(
    (n, b) => n + (counts[b] ?? 0),
    0,
  );

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
  if (Object.keys(analysisWhere).length) {
    where.analysis = { is: analysisWhere };
  }

  const filtered = hasFilters
    ? await prisma.emailRecord.findMany({
        where,
        // List columns only — see the note in /mail; the row also holds the
        // full body and raw headers.
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

  const filterValues: FilterValues = { q, domain, category, band, since };

  return (
    <>
      <PageHeader
        title="Threat summary"
        description="Overview of analyzed mail, risk distribution, and recent detections."
        actions={
          <Link href="/scan">
            <Button size="sm">Run a scan</Button>
          </Link>
        }
      />

      {activeJob && <ScanRunner initial={toProgress(activeJob)} compact />}

      {/* Polls Gmail for arrivals and runs them through the same pipeline. */}
      {!activeJob && <NewMailWatcher />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Emails analyzed" value={total} tone="neutral" />
        <StatTile
          label="Clean"
          value={(counts.SAFE ?? 0) + (counts.LOW ?? 0)}
          tone="good"
          hint="safe or low risk"
        />
        <StatTile
          label="Flagged"
          value={flagged}
          tone="warn"
          hint="medium and above"
        />
        <StatTile
          label="Critical"
          value={counts.CRITICAL ?? 0}
          tone="danger"
          hint="needs attention now"
        />
      </div>

      {/* Risk mix and origin geography answer two different questions, so they
          sit side by side rather than stacked a screen apart. */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="sheen">
          <CardBody>
            <p className="mb-4 text-xs font-medium text-muted">Risk distribution</p>
            <div className="flex flex-col gap-2.5">
              {BAND_ORDER.map((bandKey) => {
                const c = counts[bandKey] ?? 0;
                const pct = total ? Math.round((c / total) * 100) : 0;
                return (
                  <div key={bandKey} className="flex items-center gap-3 text-xs">
                    <span className="w-16 shrink-0 text-muted">
                      {BAND_META[bandKey].label}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={`block h-full rounded-full ${BAND_META[bandKey].dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right tnum text-muted">
                      {c}
                      <span className="ml-1 text-muted/50">{pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card className="sheen">
          <CardBody>
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted">
                Top incoming mail locations
              </p>
              {geoTotal > 0 && (
                <p className="shrink-0 text-[11px] text-muted/60">
                  {geoTotal} geolocated
                </p>
              )}
            </div>
            {geoTotal === 0 ? (
              <p className="py-6 text-center text-xs text-muted/70">
                No origin geography yet — it is resolved from each message&apos;s
                earliest trusted mail server during a scan.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {byCountry.map((row) => {
                  const count = row._count._all;
                  const pct = Math.round((count / geoTotal) * 100);
                  return (
                    <div key={row.country} className="flex items-center gap-3 text-xs">
                      <span
                        className="flex w-36 shrink-0 items-center gap-1.5 truncate"
                        title={countryName(row.country)}
                      >
                        <span aria-hidden className="text-sm leading-none">
                          {countryFlag(row.country)}
                        </span>
                        <span className="truncate text-muted">
                          {countryName(row.country)}
                        </span>
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right tnum text-muted">
                        {count}
                        <span className="ml-1 text-muted/50">{pct}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {total === 0 ? (
        <div className="mt-4">
          <EmptyState>
            No mail analyzed yet — run a scan or load the demo mailbox to
            populate the dashboard.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium">Find mail</h2>
          <Filters values={filterValues} action="/dashboard" />

          {hasFilters && (
            <Card>
              <CardBody className="p-0">
                {filtered.length === 0 ? (
                  <p className="p-4 text-sm text-muted">
                    No emails match those filters.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {filtered.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/mail/${e.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-foreground">
                              {e.subject || "(no subject)"}
                            </span>
                            <span className="ml-2 text-xs text-muted">{e.senderDomain}</span>
                          </span>
                          {e.analysis ? (
                            <RiskBadge band={e.analysis.band} score={e.analysis.score} />
                          ) : (
                            <span className="text-xs text-muted">pending</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
