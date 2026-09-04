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

  const emails = await prisma.emailRecord.findMany({
    where,
    include: { analysis: true },
    orderBy: [{ sentAt: "desc" }],
    take: 200,
  });

  const byDomain = new Map<string, typeof emails>();
  for (const e of emails) {
    const list = byDomain.get(e.senderDomain) ?? [];
    list.push(e);
    byDomain.set(e.senderDomain, list);
  }

  const totalCount = await prisma.emailRecord.count({ where: { userId } });

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
                    <summary className="cursor-pointer list-none px-5 py-3 hover:bg-surface-2">
                      <span className="font-mono text-xs text-muted">{domain}</span>
                      <span className="ml-2 text-xs text-muted/70">
                        ({list.length})
                      </span>
                    </summary>
                    <CardBody className="pt-0">
                      <ul className="divide-y divide-border">
                        {list.map((e) => (
                          <li key={e.id}>
                            <Link
                              href={`/mail/${e.id}`}
                              className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {e.subject || "(no subject)"}
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
