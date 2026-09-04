import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import { parseAuthenticationResults } from "@/server/detect/context";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/RiskBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import { SignalBlock, type SignalView } from "@/components/SignalBlock";
import { HopTimeline, type HopRow } from "@/components/HopTimeline";
import { GeoMapLoader } from "@/components/GeoMapLoader";
import type { GeoPoint } from "@/components/GeoMap";
import { AuthenticityCard } from "@/components/AuthenticityCard";

export const dynamic = "force-dynamic";

async function loadEmail(id: string, userId: string) {
  return prisma.emailRecord.findFirst({
    where: { id, userId },
    include: {
      analysis: { include: { signals: true } },
      urls: true,
      attachments: true,
      geoIntel: { orderBy: { hopIndex: "asc" } },
    },
  });
}

export async function generateMetadata(
  props: PageProps<"/mail/[id]">,
): Promise<Metadata> {
  const session = await auth();
  if (!session?.user) return {};
  const { id } = await props.params;
  const email = await loadEmail(id, session.user.id);
  return { title: email?.subject || "(no subject)" };
}

export default async function MailDetailPage(props: PageProps<"/mail/[id]">) {
  const session = await auth();
  const { id } = await props.params;
  const email = await loadEmail(id, session!.user.id);
  if (!email) notFound();

  const rawHeaders = email.rawHeaders as Record<string, string>;
  const receivedHeaders = rawHeaders.received ? rawHeaders.received.split("\n") : [];
  const received = analyzeReceivedChain(receivedHeaders);
  const authResults = parseAuthenticationResults(
    rawHeaders["authentication-results"] ?? null,
  );

  const geoByIndex = new Map(email.geoIntel.map((g) => [g.hopIndex, g]));
  const originGeo = email.geoIntel.find((g) => g.isTrustedOrigin);

  const hopRows: HopRow[] = received.hops
    .filter((h) => h.fromIp)
    .map((h) => {
      const g = geoByIndex.get(h.index);
      return {
        hopIndex: h.index,
        ip: h.fromIp!,
        fromHost: h.fromHost,
        byHost: h.byHost,
        ptr: g?.ptr ?? null,
        city: g?.city ?? null,
        country: g?.country ?? null,
        org: g?.org ?? null,
        timestamp: h.timestamp ? h.timestamp.toISOString() : null,
        isTrustedOrigin: received.originHop?.index === h.index,
        unverified:
          received.unverifiedFromIndex !== null &&
          h.index >= received.unverifiedFromIndex,
      };
    });

  const geoPoints: GeoPoint[] = email.geoIntel
    .filter((g): g is typeof g & { lat: number; lon: number } => g.lat != null && g.lon != null)
    .map((g) => ({
      hopIndex: g.hopIndex,
      ip: g.ip,
      lat: g.lat,
      lon: g.lon,
      city: g.city,
      country: g.country,
      org: g.org,
      isTrustedOrigin: g.isTrustedOrigin,
    }));

  const signals: SignalView[] = (email.analysis?.signals ?? [])
    .filter((s) => s.triggered)
    .sort((a, b) => b.contribution - a.contribution)
    .map((s) => ({
      id: s.id,
      detectorId: s.detectorId,
      category: s.category,
      triggered: s.triggered,
      severity: s.severity,
      contribution: s.contribution,
      evidence: (s.evidence as SignalView["evidence"]) ?? [],
      tags: s.tags,
    }));
  const maxContribution = Math.max(1, ...signals.map((s) => s.contribution), 0.01);

  return (
    <>
      <PageHeader
        title={email.subject || "(no subject)"}
        description={`${email.fromDisplay ? `${email.fromDisplay} · ` : ""}${email.fromAddress}`}
        actions={
          email.analysis && (
            <RiskBadge band={email.analysis.band} score={email.analysis.score} />
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-6">
            {email.analysis ? (
              <ScoreGauge score={email.analysis.score} band={email.analysis.band} />
            ) : (
              <p className="text-xs text-muted">Not yet analyzed</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why this was flagged</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              {email.analysis?.summary ?? "This message has not been analyzed yet."}
            </p>
            <AuthenticityCard
              spf={authResults.spf}
              dkim={authResults.dkim}
              dmarc={authResults.dmarc}
              originCountry={originGeo?.country ?? null}
              hopCount={received.hops.length}
              originObscured={received.originObscured}
              hasUnverifiedHops={received.unverifiedFromIndex !== null}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signal breakdown</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {signals.length ? (
              signals.map((s) => (
                <SignalBlock key={s.id} signal={s} maxContribution={maxContribution} />
              ))
            ) : (
              <p className="text-xs text-muted">No signals triggered on this message.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forensic hop timeline</CardTitle>
          </CardHeader>
          <CardBody>
            <HopTimeline hops={hopRows} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Geolocation</CardTitle>
          </CardHeader>
          <CardBody>
            <GeoMapLoader points={geoPoints} />
          </CardBody>
        </Card>
      </div>

      {(email.urls.length > 0 || email.attachments.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {email.urls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Links ({email.urls.length})</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {email.urls.slice(0, 20).map((u) => (
                  <div key={u.id} className="text-xs">
                    <p className="truncate font-mono text-muted" title={u.rawUrl}>
                      {u.rawUrl}
                    </p>
                    {u.finalUrl && u.finalUrl !== u.rawUrl && (
                      <p className="truncate text-muted/70">→ {u.finalUrl}</p>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {u.verdict && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">{u.verdict}</span>
                      )}
                      {u.domainAgeDays !== null && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">
                          {u.domainAgeDays}d old
                        </span>
                      )}
                      {u.isShortener && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">shortener</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {email.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Attachments ({email.attachments.length})</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {email.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="truncate font-mono text-muted">{a.filename}</span>
                    {a.isHighRisk && (
                      <span className="ml-2 shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                        high risk
                      </span>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <details className="mt-4 rounded-lg border border-border bg-surface p-3 text-xs">
        <summary className="cursor-pointer text-muted">Raw headers</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
          {Object.entries(rawHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")}
        </pre>
      </details>
    </>
  );
}
