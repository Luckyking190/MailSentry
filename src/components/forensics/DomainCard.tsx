import Link from "next/link";
import type { RiskBand } from "@prisma/client";

import { Icon } from "@/components/Icon";
import { countryFlag, countryName } from "@/lib/geo";
import { cn } from "@/lib/utils";

/** Tier language mirrors the design; the band underneath is the engine's. */
const TIER: Record<RiskBand, { label: string; stripe: string; text: string; chip: string }> = {
  CRITICAL: {
    label: "Tier 1: Critical",
    stripe: "bg-error",
    text: "text-error",
    chip: "bg-error/15 text-error",
  },
  HIGH: {
    label: "Tier 2: High Threat",
    stripe: "bg-medium",
    text: "text-medium",
    chip: "bg-medium/15 text-medium",
  },
  MEDIUM: {
    label: "Tier 3: Suspicious",
    stripe: "bg-medium",
    text: "text-medium",
    chip: "bg-medium/15 text-medium",
  },
  LOW: {
    label: "Low Risk",
    stripe: "bg-secondary",
    text: "text-secondary",
    chip: "bg-secondary/15 text-secondary",
  },
  SAFE: {
    label: "Zero Risk: Clean",
    stripe: "bg-secondary",
    text: "text-secondary",
    chip: "bg-secondary/15 text-secondary",
  },
};

export type AuthVerdict = { spf: string; dkim: string; dmarc: string };

export type DomainCardData = {
  domain: string;
  band: RiskBand;
  score: number;
  count: number;
  emailId: string;
  subject: string;
  fromAddress: string;
  origin: {
    ip: string;
    city: string | null;
    country: string | null;
    asn: string | null;
    org: string | null;
  } | null;
  auth: AuthVerdict;
  domainAgeDays: number | null;
  registrar: string | null;
  lookalikeOf: string | null;
  vector: { title: string; detail: string | null; note: string | null } | null;
  rawHeaderSnippet: string | null;
};

/** Pass = emerald, anything else = threat accent. */
function authTone(v: string): string {
  const ok = /^(pass)$/i.test(v);
  const neutral = /^(none|not evaluated|unknown)$/i.test(v);
  if (ok) return "bg-secondary/20 text-secondary";
  if (neutral) return "bg-on-surface-variant/15 text-on-surface-variant";
  return "bg-error/15 text-error";
}

function ageLabel(days: number | null): { text: string; tone: string } {
  if (days == null) return { text: "Unknown", tone: "text-on-surface-variant" };
  if (days < 2) return { text: `${days * 24} hours (Ephemeral)`, tone: "text-error" };
  if (days < 30) return { text: `${days} days (Active campaign)`, tone: "text-medium" };
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return {
    text: y > 0 ? `${y}y ${m}m` : `${days} days`,
    tone: "text-on-surface",
  };
}

export function DomainCard({ d }: { d: DomainCardData }) {
  const tier = TIER[d.band];
  const age = ageLabel(d.domainAgeDays);

  return (
    <div className="elev-2 flex flex-col overflow-hidden rounded-xl bg-surface-low">
      {/* Header ---------------------------------------------------------- */}
      <div className="flex flex-col items-start justify-between gap-space-sm bg-surface-container p-space-md lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-space-sm">
          <div className={cn("h-10 w-2.5 shrink-0 rounded-full", tier.stripe)} />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className={cn("t-mono-md font-bold tracking-tight", tier.text)}>
                DOMAIN:
              </span>
              <span className="t-mono-md truncate font-bold text-primary">
                {d.domain}
              </span>
              <span className={cn("t-label-sm rounded px-space-xs py-0.5", tier.chip)}>
                {tier.label}
              </span>
              {d.count > 1 && (
                <span className="t-label-sm rounded bg-surface-high px-space-xs py-0.5 text-on-surface-variant">
                  {d.count} messages
                </span>
              )}
            </div>
            <span className="t-mono-sm truncate text-on-surface-variant">
              Routed envelope: {d.fromAddress}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-space-xs self-end lg:self-center">
          <span className="t-mono-sm rounded bg-surface-high px-space-xs py-1 text-on-surface-variant">
            Score: {d.score}/100
          </span>
          <Link
            href={`/mail/${d.emailId}`}
            className="flex items-center gap-1 rounded bg-surface-highest px-space-sm py-1 t-mono-sm text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="analytics" className="text-[14px]" />
            <span>Inspect IOCs</span>
          </Link>
        </div>
      </div>

      {/* Body ------------------------------------------------------------ */}
      <div className="flex flex-col gap-space-md p-space-lg">
        <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
          {/* Origin telemetry */}
          <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container p-space-sm">
            <span className="t-label-sm text-on-surface-variant">Origin Telemetry</span>
            {d.origin ? (
              <>
                <div className="flex items-center gap-space-xs text-on-surface">
                  <Icon name="public" className={cn("text-[16px]", tier.text)} />
                  <span className="t-mono-md font-bold">{d.origin.ip}</span>
                </div>
                <div className="flex flex-wrap items-center gap-space-xs t-mono-sm text-on-surface-variant">
                  <span>
                    {countryFlag(d.origin.country)}{" "}
                    {[d.origin.city, countryName(d.origin.country)]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
                <span className="t-mono-sm truncate text-on-surface-variant">
                  {[d.origin.asn, d.origin.org].filter(Boolean).join(" • ") ||
                    "No ASN data"}
                </span>
              </>
            ) : (
              <span className="t-mono-sm text-on-surface-variant">
                No public originating hop resolved.
              </span>
            )}
          </div>

          {/* Protocols & WHOIS */}
          <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container p-space-sm">
            <span className="t-label-sm text-on-surface-variant">Protocols &amp; WHOIS</span>
            <div className="flex flex-wrap items-center gap-space-xs">
              {(
                [
                  ["SPF", d.auth.spf],
                  ["DKIM", d.auth.dkim],
                  ["DMARC", d.auth.dmarc],
                ] as const
              ).map(([k, v]) => (
                <span
                  key={k}
                  className={cn(
                    "t-mono-sm rounded px-1.5 py-0.5 font-bold uppercase",
                    authTone(v),
                  )}
                >
                  {k}: {v}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1 t-mono-sm text-on-surface-variant">
              <span>Age:</span>
              <span className={cn("font-semibold", age.tone)}>{age.text}</span>
            </div>
            <div className="flex items-center justify-between gap-2 t-mono-sm text-on-surface-variant">
              <span className="shrink-0">
                {d.lookalikeOf ? "Impersonates:" : "Registrar:"}
              </span>
              <span
                className={cn(
                  "truncate",
                  d.lookalikeOf ? "font-semibold text-error" : "text-on-surface",
                )}
              >
                {d.lookalikeOf ?? d.registrar ?? "Unknown"}
              </span>
            </div>
          </div>

          {/* Payload & vector */}
          <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container p-space-sm">
            <span className="t-label-sm text-on-surface-variant">Payload &amp; Vector</span>
            {d.vector ? (
              <>
                <div className="flex items-center gap-space-xs">
                  <Icon name="warning" className={cn("text-[14px]", tier.text)} />
                  <span className="t-mono-sm font-bold text-on-surface">
                    {d.vector.title}
                  </span>
                </div>
                {d.vector.detail && (
                  <span className="t-mono-sm text-on-surface-variant">
                    {d.vector.detail}
                  </span>
                )}
                {d.vector.note && (
                  <div className={cn("flex items-center gap-space-xs t-mono-sm", tier.text)}>
                    <Icon name="link_off" className="text-[12px]" />
                    <span className="truncate">{d.vector.note}</span>
                  </div>
                )}
              </>
            ) : (
              <span className="t-mono-sm text-on-surface-variant">
                No malicious payload indicators.
              </span>
            )}
          </div>
        </div>

        {/* Raw header snippet */}
        {d.rawHeaderSnippet && (
          <div className="flex flex-col gap-1 overflow-x-auto rounded-lg bg-surface-lowest p-space-sm">
            <div className="flex items-center justify-between pb-1">
              <span className="t-label-sm text-on-surface-variant">
                Raw Header Snippet
              </span>
              <span className="t-mono-sm text-on-surface-variant">
                RFC-822 Direct Stream
              </span>
            </div>
            <code className="t-mono-sm whitespace-pre font-mono leading-relaxed text-on-surface-variant/90">
              {d.rawHeaderSnippet}
            </code>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className={cn("size-2 rounded-full", tier.stripe)} />
            <span className={cn("t-mono-sm font-semibold", tier.text)}>
              {d.subject || "(no subject)"}
            </span>
          </div>
          <Link
            href={`/mail/${d.emailId}`}
            className="flex items-center gap-1 rounded-lg bg-surface-highest px-space-md py-1.5 t-mono-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="travel_explore" className="text-[14px]" />
            <span>Full forensics</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
