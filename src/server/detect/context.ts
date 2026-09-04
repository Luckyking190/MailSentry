import { spf as mailauthSpf } from "mailauth";

import type { ParsedEmail } from "@/server/mail/types";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import { getSpfRecord, mailauthResolver } from "@/server/intel/dns";
import { DEFAULT_BAND_THRESHOLDS, type BandThresholds } from "@/lib/scoring";
import type {
  AuthVerdict,
  DetectorContext,
  ParsedAuthResults,
  ResolvedSettings,
} from "./types";

const VERDICTS = new Set<string>([
  "pass", "fail", "softfail", "neutral", "none",
  "temperror", "permerror", "policy", "bestguesspass",
]);

function verdict(s: string | undefined): AuthVerdict {
  const v = s?.toLowerCase().trim() ?? "";
  return VERDICTS.has(v) ? (v as AuthVerdict) : null;
}

export function parseAuthenticationResults(
  raw: string | null,
): ParsedAuthResults {
  const base: ParsedAuthResults = {
    raw,
    spf: null, spfDomain: null,
    dkim: null, dkimDomain: null,
    dmarc: null, dmarcDomain: null,
  };
  if (!raw) return base;
  const text = raw.replace(/\s+/g, " ");

  const spfM = text.match(/\bspf=([a-z]+)/i);
  base.spf = verdict(spfM?.[1]);
  base.spfDomain =
    text.match(/smtp\.mailfrom=["<]?([^\s;"'>]+)/i)?.[1]?.split("@").pop()?.toLowerCase() ??
    null;

  const dkimM = text.match(/\bdkim=([a-z]+)/i);
  base.dkim = verdict(dkimM?.[1]);
  base.dkimDomain =
    text.match(/\bdkim=[a-z]+[^;]*?header\.d=([^\s;"']+)/i)?.[1]?.toLowerCase() ??
    text.match(/\bheader\.i=@?([^\s;"']+)/i)?.[1]?.toLowerCase() ??
    null;

  const dmarcM = text.match(/\bdmarc=([a-z]+)/i);
  base.dmarc = verdict(dmarcM?.[1]);
  base.dmarcDomain =
    text.match(/\bdmarc=[a-z]+[^;]*?header\.from=([^\s;"']+)/i)?.[1]?.toLowerCase() ??
    null;

  return base;
}

export function resolveSettings(raw: {
  detectorWeights?: unknown;
  bandThresholds?: unknown;
  brandWatchlist?: string[];
  enableLlm?: boolean;
}): ResolvedSettings {
  return {
    detectorWeights:
      raw.detectorWeights && typeof raw.detectorWeights === "object"
        ? (raw.detectorWeights as Record<string, number>)
        : {},
    bandThresholds: normalizeThresholds(raw.bandThresholds),
    brandWatchlist: (raw.brandWatchlist ?? []).map((s) => s.toLowerCase()),
    enableLlm: raw.enableLlm ?? true,
  };
}

function normalizeThresholds(raw: unknown): BandThresholds {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<BandThresholds>;
    return {
      low: r.low ?? DEFAULT_BAND_THRESHOLDS.low,
      medium: r.medium ?? DEFAULT_BAND_THRESHOLDS.medium,
      high: r.high ?? DEFAULT_BAND_THRESHOLDS.high,
      critical: r.critical ?? DEFAULT_BAND_THRESHOLDS.critical,
    };
  }
  return DEFAULT_BAND_THRESHOLDS;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function buildContext(
  email: ParsedEmail,
  userId: string,
  settings: ResolvedSettings,
): Promise<DetectorContext> {
  const received = analyzeReceivedChain(email.receivedChain);
  const authResults = parseAuthenticationResults(email.authenticationResults);

  let spfCheck: DetectorContext["spfCheck"] = null;
  const clientIp = received.originIp;
  const senderForSpf = email.returnPath || email.fromAddress;

  if (clientIp && senderForSpf.includes("@")) {
    try {
      const [res, record] = await Promise.all([
        withTimeout(
          mailauthSpf({
            sender: senderForSpf,
            ip: clientIp,
            helo:
              received.originHop?.fromHost ??
              senderForSpf.split("@").pop() ??
              "unknown",
            mta: "mailsentry.local",
            resolver: mailauthResolver(),
          }) as Promise<{
            status?: { result?: string; comment?: string | false };
            domain?: string;
          }>,
          6000,
        ),
        withTimeout(getSpfRecord(email.senderDomain), 4000),
      ]);

      spfCheck = {
        result: verdict(res?.status?.result),
        domain: res?.domain ?? email.senderDomain,
        clientIp,
        record: record ?? null,
        comment:
          typeof res?.status?.comment === "string"
            ? res.status.comment
            : null,
      };
    } catch {
      spfCheck = {
        result: null,
        domain: email.senderDomain,
        clientIp,
        record: null,
        comment: "SPF check errored",
      };
    }
  }

  return {
    email,
    userId,
    settings,
    received,
    authResults,
    spfCheck,
    sink: { urls: [], attachments: [] },
  };
}
