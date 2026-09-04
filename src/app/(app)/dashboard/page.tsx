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
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { BAND_ORDER, BAND_META, SIGNAL_CATEGORIES } from "@/lib/scoring";

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

  const [total, byBand, job] = await Promise.all([
    prisma.emailRecord.count({ where: { userId } }),
    prisma.analysisResult.groupBy({
      by: ["band"],
      where: { email: { userId } },
      _count: true,
    }),
    getActiveOrLatestJob(userId),
  ]);

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Emails analyzed</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Flagged (medium+)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-orange-300">
              {flagged}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted">Critical</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-300">
              {counts.CRITICAL ?? 0}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardBody>
            <p className="mb-3 text-xs text-muted">Risk distribution</p>
            <div className="flex flex-col gap-2">
              {BAND_ORDER.map((bandKey) => {
                const c = counts[bandKey] ?? 0;
                const pct = total ? Math.round((c / total) * 100) : 0;
                return (
                  <div key={bandKey} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-muted">{BAND_META[bandKey].label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={`block h-full ${BAND_META[bandKey].dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted">{c}</span>
                  </div>
                );
              })}
            </div>
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
