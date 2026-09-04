import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { ALL_DETECTORS } from "@/server/detect/registry";
import { DETECTOR_LABEL } from "@/lib/detectorLabels";
import { DEFAULT_BAND_THRESHOLDS, type BandThresholds } from "@/lib/scoring";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/SettingsForm";
import { ReanalyzeButton } from "@/components/ReanalyzeButton";
import { DeleteDataButton } from "@/components/DeleteDataButton";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const emailCount = await prisma.emailRecord.count({ where: { userId } });

  const detectors = ALL_DETECTORS.map((d) => ({
    id: d.id,
    label: DETECTOR_LABEL[d.id] ?? d.id,
    defaultWeight: d.defaultWeight,
  }));

  const bandThresholds = (settings.bandThresholds as Partial<BandThresholds>) ?? {};

  return (
    <>
      <PageHeader
        title="Settings"
        description="Scan window, risk thresholds, detector weights, and data controls."
      />

      <SettingsForm
        initial={{
          scanWindowDays: settings.scanWindowDays,
          maxEmails: settings.maxEmails,
          enableLlm: settings.enableLlm,
          llmModel: settings.llmModel,
          bandThresholds: {
            low: bandThresholds.low ?? DEFAULT_BAND_THRESHOLDS.low,
            medium: bandThresholds.medium ?? DEFAULT_BAND_THRESHOLDS.medium,
            high: bandThresholds.high ?? DEFAULT_BAND_THRESHOLDS.high,
            critical: bandThresholds.critical ?? DEFAULT_BAND_THRESHOLDS.critical,
          },
          detectorWeights: (settings.detectorWeights as Record<string, number>) ?? {},
          brandWatchlist: settings.brandWatchlist,
        }}
        detectors={detectors}
        featherlessConfigured={!!process.env.FEATHERLESS_API_KEY}
      />

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Signed in as</span>
              <span>{session!.user.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Emails scanned</span>
              <span className="tabular-nums">{emailCount}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div>
                <p className="font-medium">Re-run analysis</p>
                <p className="text-xs text-muted">
                  Re-score every scanned email with your current weights and
                  thresholds — no Gmail re-fetch.
                </p>
              </div>
              <ReanalyzeButton scope="all" label="Re-run analysis" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div>
                <p className="font-medium text-rose-300">Delete my data</p>
                <p className="text-xs text-muted">
                  Removes every scanned email and analysis stored for your
                  account. Your Google sign-in is unaffected.
                </p>
              </div>
              <DeleteDataButton />
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
