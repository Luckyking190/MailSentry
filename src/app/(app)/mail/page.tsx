import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, Placeholder } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { RiskBadge } from "@/components/RiskBadge";

export const metadata: Metadata = { title: "Mail" };

export default async function MailPage() {
  const session = await auth();
  const userId = session!.user.id;

  const emails = await prisma.emailRecord.findMany({
    where: { userId },
    include: { analysis: true },
    orderBy: [{ sentAt: "desc" }],
    take: 100,
  });

  const byDomain = new Map<string, typeof emails>();
  for (const e of emails) {
    const list = byDomain.get(e.senderDomain) ?? [];
    list.push(e);
    byDomain.set(e.senderDomain, list);
  }

  if (emails.length === 0) {
    return (
      <>
        <PageHeader title="Mail analysis" description="Emails grouped by sender domain." />
        <Placeholder phase="Phase 2">
          No emails yet. Run a scan first — analysis blocks and per-mail
          geolocation land in Phase 6–7.
        </Placeholder>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mail analysis"
        description={`${emails.length} emails across ${byDomain.size} sender domains.`}
      />
      <div className="flex flex-col gap-4">
        {[...byDomain.entries()].map(([domain, list]) => (
          <Card key={domain}>
            <CardBody>
              <p className="mb-3 font-mono text-xs text-muted">{domain}</p>
              <ul className="divide-y divide-border">
                {list.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {e.subject || "(no subject)"}
                    </span>
                    {e.analysis ? (
                      <RiskBadge
                        band={e.analysis.band}
                        score={e.analysis.score}
                      />
                    ) : (
                      <span className="text-xs text-muted">pending</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
