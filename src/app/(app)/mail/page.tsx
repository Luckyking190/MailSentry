import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, RiskBand } from "@prisma/client";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { RiskBadge } from "@/components/RiskBadge";
import { Filters, type FilterValues } from "@/components/Filters";
import { BAND_ORDER, SIGNAL_CATEGORIES } from "@/lib/scoring";
import { placeLabel } from "@/lib/geo";

export const metadata: Metadata = { title: "Mail" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
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

  const [emails, totalCount] = await Promise.all([
    prisma.emailRecord.findMany({
      where,
      // Select only what this list renders. An EmailRecord also carries
      // bodyText (<=32KB), bodyHtml (<=64KB) and the rawHeaders JSON, so
      // `include` was pulling up to ~20MB over the wire to draw 200 subjects.
      select: {
        id: true,
        subject: true,
        senderDomain: true,
        analysis: { select: { band: true, score: true } },
        priorityScore: true,
        isUnread: true,
        // Origin hop only — one row per email, not the whole chain.
        geoIntel: {
          where: { isTrustedOrigin: true },
          select: { country: true, city: true },
          take: 1,
        },
      },
      // Priority first so the mail the user actually cares about floats up;
      // nulls (not yet scored) sort last rather than ahead of everything.
      orderBy: [{ priorityScore: { sort: "desc", nulls: "last" } }, { sentAt: "desc" }],
      take: 200,
    }),
    prisma.emailRecord.count({ where: { userId } }),
  ]);

  const byDomain = new Map<string, typeof emails>();
  for (const e of emails) {
    const list = byDomain.get(e.senderDomain) ?? [];
    list.push(e);
    byDomain.set(e.senderDomain, list);
  }

  const filterValues: FilterValues = { q, domain, category, band, since };

  return (
    <>
      <PageHeader
        title="Mail analysis"
        description={
          totalCount
            ? `${emails.length} of ${totalCount} emails across ${byDomain.size} sender domains.`
            : "Emails grouped by sender domain."
        }
      />

      {totalCount === 0 ? (
        <EmptyState>
          No emails yet. Run a scan or load the demo mailbox from the{" "}
          <Link href="/scan" className="text-brand underline">
            scan screen
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <Filters values={filterValues} action="/mail" />

          {emails.length === 0 ? (
            <EmptyState>No emails match those filters.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {[...byDomain.entries()].map(([domain, list]) => (
                <Card key={domain} className="overflow-hidden">
                  <details open={byDomain.size <= 8}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 transition-colors hover:bg-surface-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-brand/60" />
                      <span className="truncate font-mono text-xs text-foreground">
                        {domain}
                      </span>
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] tnum text-muted">
                        {list.length}
                      </span>
                    </summary>
                    <CardBody className="pt-0">
                      <ul className="divide-y divide-border">
                        {list.map((e) => (
                          <li key={e.id}>
                            <Link
                              href={`/mail/${e.id}`}
                              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-surface-2"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {e.isUnread && (
                                  <span
                                    className="mr-1.5 inline-block size-1.5 rounded-full bg-brand align-middle"
                                    title="Unread in Gmail"
                                  />
                                )}
                                {e.subject || "(no subject)"}
                              </span>
                              {e.priorityScore != null && (
                                <span
                                  className="hidden shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] tnum text-muted md:inline"
                                  title={`Priority ${e.priorityScore}/100 — learned from how often you read ${e.senderDomain}, plus recency and risk`}
                                >
                                  P{e.priorityScore}
                                </span>
                              )}
                              {e.geoIntel[0] && (
                                <span
                                  className="hidden shrink-0 text-xs text-muted sm:inline"
                                  title={`Originating mail server: ${placeLabel(
                                    e.geoIntel[0].country,
                                    e.geoIntel[0].city,
                                  )}`}
                                >
                                  {placeLabel(e.geoIntel[0].country, e.geoIntel[0].city)}
                                </span>
                              )}
                              {e.analysis ? (
                                <RiskBadge band={e.analysis.band} score={e.analysis.score} />
                              ) : (
                                <span className="text-xs text-muted">pending</span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </details>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
