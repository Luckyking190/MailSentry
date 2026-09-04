import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, Placeholder } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BAND_ORDER, BAND_META } from "@/lib/scoring";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [total, byBand] = await Promise.all([
    prisma.emailRecord.count({ where: { userId } }),
    prisma.analysisResult.groupBy({
      by: ["band"],
      where: { email: { userId } },
      _count: true,
    }),
  ]);

  const counts = Object.fromEntries(byBand.map((b) => [b.band, b._count]));
  const flagged = BAND_ORDER.filter((b) => b !== "SAFE" && b !== "LOW").reduce(
    (n, b) => n + (counts[b] ?? 0),
    0,
  );

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
              {BAND_ORDER.map((band) => {
                const c = counts[band] ?? 0;
                const pct = total ? Math.round((c / total) * 100) : 0;
                return (
                  <div key={band} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-muted">
                      {BAND_META[band].label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={`block h-full ${BAND_META[band].dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted">
                      {c}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      {total === 0 && (
        <div className="mt-4">
          <Placeholder phase="Phase 2">
            No mail analyzed yet — run a scan to populate the dashboard.
          </Placeholder>
        </div>
      )}
    </>
  );
}
