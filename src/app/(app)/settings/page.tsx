import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, Placeholder } from "@/components/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Scan window, risk thresholds, detector weights, and data controls."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scan</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Look-back window" value={`${settings.scanWindowDays} days`} />
            <Row label="Max emails per scan" value={String(settings.maxEmails)} />
            <Row
              label="AI (Featherless) analysis"
              value={settings.enableLlm ? "Enabled" : "Disabled"}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Signed in as" value={session!.user.email ?? "—"} />
            <Row label="Brand watchlist" value={`${settings.brandWatchlist.length} custom`} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Placeholder phase="Phase 7">
          Editable weight sliders, threshold inputs, watchlist editor, re-run
          analysis, and “delete my data”.
        </Placeholder>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
