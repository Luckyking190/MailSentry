import { spf as mailauthSpf } from "mailauth";

import type { ParsedEmail } from "@/server/mail/types";
import { analyzeReceivedChain } from "@/server/intel/received-chain";
import { getSpfRecord, mailauthResolver } from "@/server/intel/dns";
import { analyzeWithLlm } from "@/server/llm/analyze";
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

/**
 * An SPF evaluation is deterministic for a given (sender domain, client IP)
 * pair and is by far the most DNS-heavy step in the pipeline, so memoise the
 * whole verdict — a mailbox is dominated by a handful of repeat senders, and
 * this turns every repeat into a no-op instead of re-walking the include:
 * chain. In-process only; deliberately not a DB cache (see intel/dns.ts).
 */
const spfCache = new Map<
  string,
  { value: DetectorContext["spfCheck"]; expires: number }
>();
const SPF_CACHE_TTL_MS = 15 * 60_000;

async function checkSpf(
  email: ParsedEmail,
  received: ReturnType<typeof analyzeReceivedChain>,
): Promise<DetectorContext["spfCheck"]> {
  const clientIp = received.originIp;
  const senderForSpf = email.returnPath || email.fromAddress;
  if (!clientIp || !senderForSpf.includes("@")) return null;

  const cacheKey = `${senderForSpf.split("@").pop()}|${email.senderDomain}|${clientIp}`;
  const cached = spfCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  let value: DetectorContext["spfCheck"];
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

    value = {
      result: verdict(res?.status?.result),
      domain: res?.domain ?? email.senderDomain,
      clientIp,
      record: record ?? null,
      comment: typeof res?.status?.comment === "string" ? res.status.comment : null,
    };
  } catch {
    value = {
      result: null,
      domain: email.senderDomain,
      clientIp,
      record: null,
      comment: "SPF check errored",
    };
  }

  spfCache.set(cacheKey, { value, expires: Date.now() + SPF_CACHE_TTL_MS });
  return value;
}

/** Cheap signals that something in this message is worth an LLM opinion. */
const LLM_WORTH_IT_RE =
  /\b(urgent|immediate|verify|suspend|password|otp|invoice|payment|wire|bank|gift card|payroll|refund|account (locked|closed|limited)|confirm your|click here|act now|final notice|as soon as possible|are you (available|at your desk))\b/i;

/**
 * Whether to spend an LLM call on this message.
 *
 * The deterministic layer already produces a complete score, and a provider
 * call is by far the most expensive and most latency-variable step in the
 * pipeline. A message that the receiving provider itself authenticated
 * (SPF **and** DMARC pass), carries no attachments, and contains none of the
 * language fraud actually relies on is not a case the LLM will change our
 * mind about — so skip it and keep the scan moving. Everything else, notably
 * anything unauthenticated (where BEC and impersonation live), still gets
 * the full treatment.
 *
 * Uses only header/body data already in hand — no network — so the decision
 * costs nothing and the LLM still starts in parallel with the SPF re-check.
 */
function shouldConsultLlm(
  email: ParsedEmail,
  authResults: ParsedAuthResults,
): boolean {
  if (email.attachments.length > 0) return true;

  const wellAuthenticated =
    authResults.spf === "pass" && authResults.dmarc === "pass";
  if (!wellAuthenticated) return true;

  const text = `${email.subject}\n${email.bodyText ?? email.snippet ?? ""}`;
  return LLM_WORTH_IT_RE.test(text);
}

export async function buildContext(
  email: ParsedEmail,
  userId: string,
  settings: ResolvedSettings,
): Promise<DetectorContext> {
  const received = analyzeReceivedChain(email.receivedChain);
  const authResults = parseAuthenticationResults(email.authenticationResults);

  const useLlm = settings.enableLlm && shouldConsultLlm(email, authResults);

  const [spfCheck, llm] = await Promise.all([
    checkSpf(email, received),
    useLlm ? analyzeWithLlm(email).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    email,
    userId,
    settings,
    received,
    authResults,
    spfCheck,
    llm,
    sink: { urls: [], attachments: [] },
  };
}
