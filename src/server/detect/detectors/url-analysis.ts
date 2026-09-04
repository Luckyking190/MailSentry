import { getDomain } from "tldts";

import { isPunycode } from "@/lib/homoglyph";
import { expandUrl } from "@/server/intel/url-expand";
import { getDomainAge } from "@/server/intel/rdap";
import type { ExtractedUrl } from "@/server/mail/types";
import type {
  Detector,
  DetectorResult,
  Evidence,
  UrlArtifact,
} from "../types";
import { severityFromScore } from "./_util";

const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "ow.ly", "buff.ly",
  "rebrand.ly", "cutt.ly", "rb.gy", "shorturl.at", "t.ly", "lnkd.in",
  "tiny.cc", "s.id", "bl.ink", "soo.gd", "shorte.st", "adf.ly", "trib.al",
]);

const MAX_EXPANSIONS = 3;
const MAX_AGE_LOOKUPS = 4;
const OVERALL_BUDGET_MS = 9000;

function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function anchorClaimedDomain(anchor: string | null): string | null {
  if (!anchor) return null;
  const m = anchor.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
  return m ? (getDomain(m[1]) ?? m[1].toLowerCase()) : null;
}

type Assessed = {
  url: ExtractedUrl;
  claimedDomain: string | null;
  anchorMismatch: boolean;
  isShortener: boolean;
  punycode: boolean;
  isIpHost: boolean;
  lengthScore: number;
  entropyScore: number;
  priority: number;
};

function assess(url: ExtractedUrl): Assessed {
  const host = url.host ?? "";
  const claimedDomain = anchorClaimedDomain(url.anchorText);
  const realDomain = host ? getDomain(host) : null;
  const anchorMismatch =
    !!claimedDomain && !!realDomain && claimedDomain !== realDomain;
  const isShortener = SHORTENERS.has(host);
  const punycode = isPunycode(host);
  const isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const lengthScore = Math.min(1, Math.max(0, (url.rawUrl.length - 60) / 120));
  const entropyScore = Math.min(
    1,
    Math.max(0, (shannonEntropy(url.rawUrl.slice(0, 120)) - 3.6) / 1.6),
  );

  let priority = 0;
  if (anchorMismatch) priority += 5;
  if (isShortener) priority += 4;
  if (isIpHost) priority += 4;
  if (punycode) priority += 3;
  if (url.scheme === "http") priority += 1;
  if (lengthScore > 0.6) priority += 1;

  return {
    url,
    claimedDomain,
    anchorMismatch,
    isShortener,
    punycode,
    isIpHost,
    lengthScore,
    entropyScore,
    priority,
  };
}

export const urlAnalysisDetector: Detector = {
  id: "url.analysis",
  category: "malicious_url",
  defaultWeight: 0.16,

  async run(ctx): Promise<DetectorResult> {
    const urls = ctx.email.urls;
    if (urls.length === 0) {
      return quiet();
    }

    const deadline = Date.now() + OVERALL_BUDGET_MS;
    const assessed = urls.map(assess).sort((a, b) => b.priority - a.priority);

    const evidence: Evidence[] = [];
    let score = 0;
    let ageLookups = 0;

    const toExpand = assessed
      .filter((a) => a.priority >= 3)
      .slice(0, MAX_EXPANSIONS);

    const expansions = new Map<
      string,
      Awaited<ReturnType<typeof expandUrl>>
    >();
    await Promise.all(
      toExpand.map(async (a) => {
        const left = deadline - Date.now();
        if (left < 1500) return;
        try {
          expansions.set(
            a.url.rawUrl,
            await expandUrl(a.url.rawUrl, {
              maxHops: 4,
              budgetMs: Math.min(4500, left),
            }),
          );
        } catch {
          /* ignore */
        }
      }),
    );

    for (const a of assessed) {
      const u = a.url;
      const exp = expansions.get(u.rawUrl);
      const finalHost = exp?.finalHost ?? u.host ?? null;
      const finalDomain = finalHost ? getDomain(finalHost) : null;

      let verdict: UrlArtifact["verdict"] = "unknown";
      let uScore = 0;

      if (a.anchorMismatch) {
        uScore = Math.max(uScore, 0.72);
        evidence.push({
          label: "Link text hides destination",
          value: `text says "${a.claimedDomain}" → actually ${finalHost ?? u.host}`,
          kind: "comparison",
          ref: u.rawUrl,
        });
      }
      if (a.isIpHost) {
        uScore = Math.max(uScore, 0.62);
        evidence.push({
          label: "Raw IP address link",
          value: u.rawUrl,
          kind: "fact",
          ref: u.rawUrl,
        });
      }
      if (a.punycode) {
        uScore = Math.max(uScore, 0.58);
        evidence.push({
          label: "Punycode link host",
          value: finalHost ?? u.host ?? "",
          kind: "fact",
          ref: u.rawUrl,
        });
      }
      if (a.isShortener) {
        uScore = Math.max(uScore, exp?.finalHost ? 0.35 : 0.5);
        evidence.push({
          label: "Shortened link",
          value: exp?.finalHost
            ? `${u.rawUrl} → ${exp.finalUrl}`
            : u.rawUrl,
          kind: exp?.finalHost ? "comparison" : "fact",
          ref: u.rawUrl,
        });
      }
      if (exp?.blocked && exp.blocked.includes("non-public")) {
        uScore = Math.max(uScore, 0.8);
        evidence.push({
          label: "Link resolves to an internal address",
          value: `${u.rawUrl} — ${exp.blocked}`,
          kind: "fact",
          ref: u.rawUrl,
        });
      }
      if (a.lengthScore > 0.7 && a.entropyScore > 0.5) {
        uScore = Math.max(uScore, 0.4);
        evidence.push({
          label: "Obfuscated URL",
          value: `${u.rawUrl.slice(0, 70)}… (long, high-entropy)`,
          kind: "metric",
          ref: u.rawUrl,
        });
      }

      // Domain age for the most suspicious final hosts.
      let ageDays: number | null = null;
      if (
        finalDomain &&
        ageLookups < MAX_AGE_LOOKUPS &&
        (a.isShortener || a.anchorMismatch || a.punycode || uScore >= 0.4) &&
        Date.now() < deadline
      ) {
        ageLookups += 1;
        try {
          const age = await getDomainAge(finalDomain);
          ageDays = age.ageDays;
          if (age.source === "rdap" && age.ageDays !== null) {
            if (age.ageDays <= 7) {
              uScore = Math.max(uScore, 0.85);
              evidence.push({
                label: "Very new domain",
                value: `${finalDomain} was registered ${age.ageDays} day${age.ageDays === 1 ? "" : "s"} ago`,
                kind: "metric",
                ref: u.rawUrl,
              });
            } else if (age.ageDays <= 30) {
              uScore = Math.max(uScore, 0.6);
              evidence.push({
                label: "New domain",
                value: `${finalDomain} is ${age.ageDays} days old`,
                kind: "metric",
                ref: u.rawUrl,
              });
            }
          }
        } catch {
          /* unknown age → neutral */
        }
      }

      verdict =
        uScore >= 0.7 ? "malicious" : uScore >= 0.35 ? "suspicious" : uScore > 0 ? "unknown" : "safe";
      score = Math.max(score, uScore);

      ctx.sink.urls.push({
        rawUrl: u.rawUrl,
        finalUrl: exp?.finalUrl ?? null,
        host: u.host,
        scheme: u.scheme,
        anchorText: u.anchorText,
        anchorMismatch: a.anchorMismatch,
        isShortener: a.isShortener,
        isPunycode: a.punycode,
        redirectChain: exp?.chain ?? [],
        lengthScore: a.lengthScore,
        entropyScore: a.entropyScore,
        domainAgeDays: ageDays,
        verdict,
      });
    }

    const insecure = urls.filter((u) => u.scheme === "http");
    if (insecure.length >= 2 && score < 0.3) {
      score = Math.max(score, 0.3);
      evidence.push({
        label: "Insecure links",
        value: `${insecure.length} http:// links`,
        kind: "metric",
      });
    }

    return {
      detectorId: "url.analysis",
      category: "malicious_url",
      triggered: score > 0,
      score,
      confidence: 0.6,
      severity: severityFromScore(score),
      evidence: evidence.slice(0, 10),
    };
  },
};

function quiet(): DetectorResult {
  return {
    detectorId: "url.analysis",
    category: "malicious_url",
    triggered: false,
    score: 0,
    confidence: 0.6,
    severity: "info",
    evidence: [],
  };
}
