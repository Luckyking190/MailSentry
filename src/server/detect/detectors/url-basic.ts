import { getDomain } from "tldts";

import { isPunycode } from "@/lib/homoglyph";
import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "ow.ly", "buff.ly",
  "rebrand.ly", "cutt.ly", "rb.gy", "shorturl.at", "t.ly", "lnkd.in",
  "tiny.cc", "s.id", "bl.ink", "soo.gd",
]);

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

export const urlBasicDetector: Detector = {
  id: "url.basic",
  category: "malicious_url",
  defaultWeight: 0.14,

  run(ctx): DetectorResult {
    const urls = ctx.email.urls;
    if (urls.length === 0) return none();

    const evidence: Evidence[] = [];
    let score = 0;

    const shorteners = urls.filter((u) => u.host && SHORTENERS.has(u.host));
    for (const u of shorteners) {
      score = Math.max(score, 0.5);
      evidence.push({
        label: "Shortened link",
        value: u.rawUrl,
        kind: "fact",
        ref: u.rawUrl,
      });
    }

    for (const u of urls) {
      if (!u.host) continue;

      // Anchor text claims one domain, href points elsewhere.
      if (u.anchorText) {
        const claimed = u.anchorText.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i)?.[1];
        if (claimed) {
          const claimedDom = getDomain(claimed);
          const realDom = getDomain(u.host);
          if (claimedDom && realDom && claimedDom !== realDom) {
            score = Math.max(score, 0.72);
            evidence.push({
              label: "Link text hides destination",
              value: `text says "${claimed}" but links to ${u.host}`,
              kind: "comparison",
              ref: u.rawUrl,
            });
          }
        }
      }

      if (isPunycode(u.host)) {
        score = Math.max(score, 0.55);
        evidence.push({
          label: "Punycode link host",
          value: u.host,
          kind: "fact",
          ref: u.rawUrl,
        });
      }

      // IP-literal host.
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.host)) {
        score = Math.max(score, 0.6);
        evidence.push({
          label: "Raw IP address link",
          value: u.rawUrl,
          kind: "fact",
          ref: u.rawUrl,
        });
      }

      // Deep sub-domain nesting / brand-in-subdomain handled by lookalike; here
      // just flag absurd length + high entropy paths.
      if (u.rawUrl.length > 110 && shannonEntropy(u.rawUrl.slice(0, 120)) > 4.3) {
        score = Math.max(score, 0.4);
        evidence.push({
          label: "Obfuscated URL",
          value: `${u.rawUrl.slice(0, 80)}… (long, high-entropy)`,
          kind: "metric",
          ref: u.rawUrl,
        });
      }
    }

    const insecure = urls.filter((u) => u.scheme === "http");
    if (insecure.length >= 2) {
      score = Math.max(score, 0.3);
      evidence.push({
        label: "Insecure links",
        value: `${insecure.length} http:// links`,
        kind: "metric",
      });
    }

    return {
      detectorId: "url.basic",
      category: "malicious_url",
      triggered: score > 0,
      score,
      confidence: 0.55,
      severity: severityFromScore(score),
      evidence: evidence.slice(0, 8),
    };
  },
};

function none(): DetectorResult {
  return {
    detectorId: "url.basic",
    category: "malicious_url",
    triggered: false,
    score: 0,
    confidence: 0.6,
    severity: "info",
    evidence: [],
  };
}
