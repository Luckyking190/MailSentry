import { getDomain } from "tldts";

import type { ParsedEmail } from "@/server/mail/types";
import {
  DEFAULT_BAND_THRESHOLDS,
  scoreToBand,
  type SignalCategory,
} from "@/lib/scoring";
import type { AnalysisOutcome, DetectorResult, Severity } from "./types";

export const STUB_ENGINE_VERSION = "stub-1";

const HIGH_RISK_EXT = new Set([
  "exe", "bat", "cmd", "js", "vbs", "scr", "ps1", "jar",
  "hta", "lnk", "iso", "msi", "com", "pif",
]);
const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "gz", "tar", "cab"]);

const URGENCY_RE =
  /\b(urgent|immediate action|act now|verify your account|payment failed|security alert|final notice|suspend(ed)?|within 24 hours|account (locked|disabled)|confirm your|update your (payment|billing))\b/i;
const SENSITIVE_RE =
  /\b(password|one[-\s]?time\s?code|otp|ssn|social security|bank account|routing number|credit card|cvv|wire transfer|gift card)\b/i;
const BEC_RE =
  /\b(change (the )?(bank|payment) (details|account)|update (the )?wire|process (this|the) payment|purchase .*gift cards?|are you (available|at your desk)|quick task|send me your (cell|number))\b/i;

const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "ow.ly",
  "buff.ly", "rebrand.ly", "cutt.ly", "rb.gy", "shorturl.at",
]);

const BRANDS: Record<string, string[]> = {
  microsoft: ["microsoft.com", "office.com", "live.com", "outlook.com"],
  google: ["google.com", "gmail.com", "googlemail.com"],
  apple: ["apple.com", "icloud.com"],
  amazon: ["amazon.com", "amazon.in", "amazonaws.com"],
  paypal: ["paypal.com"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  linkedin: ["linkedin.com"],
  dhl: ["dhl.com"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  hdfc: ["hdfcbank.com"],
  icici: ["icicibank.com"],
  sbi: ["sbi.co.in", "onlinesbi.com"],
};

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "aol.com", "proton.me", "protonmail.com", "yandex.com", "mail.com",
]);

function sev(score: number): Severity {
  if (score >= 0.85) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "medium";
  if (score > 0) return "low";
  return "info";
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  "stub.attachment": 0.9,
  "stub.auth-results": 0.85,
  "stub.reply-to-mismatch": 0.6,
  "stub.impersonation": 0.8,
  "stub.urgency": 0.4,
  "stub.sensitive-request": 0.6,
  "stub.bec-language": 0.7,
  "stub.suspicious-links": 0.5,
};

function detect(email: ParsedEmail): DetectorResult[] {
  const out: DetectorResult[] = [];
  const push = (
    detectorId: string,
    category: SignalCategory,
    score: number,
    confidence: number,
    evidence: DetectorResult["evidence"],
    tags?: string[],
  ) =>
    out.push({
      detectorId,
      category,
      triggered: score > 0,
      score,
      confidence,
      severity: sev(score),
      evidence,
      tags,
    });

  // --- Attachments ---
  const risky = email.attachments.filter(
    (a) => a.extension && HIGH_RISK_EXT.has(a.extension),
  );
  const doubleExt = email.attachments.filter((a) =>
    /\.(pdf|docx?|xlsx?|jpe?g|png|txt)\.(exe|scr|js|bat|cmd|vbs|ps1|com|pif)$/i.test(
      a.filename,
    ),
  );
  const archives = email.attachments.filter(
    (a) => a.extension && ARCHIVE_EXT.has(a.extension),
  );
  if (risky.length || doubleExt.length) {
    push(
      "stub.attachment",
      "malicious_attachment",
      doubleExt.length ? 1 : 0.85,
      0.9,
      [
        ...risky.map((a) => ({
          label: "High-risk attachment",
          value: a.filename,
          kind: "fact" as const,
          ref: a.filename,
        })),
        ...doubleExt.map((a) => ({
          label: "Double extension",
          value: `${a.filename} disguises an executable`,
          kind: "fact" as const,
          ref: a.filename,
        })),
      ],
    );
  } else if (archives.length) {
    push("stub.attachment", "malicious_attachment", 0.3, 0.5, [
      {
        label: "Archive attachment",
        value: `${archives.map((a) => a.filename).join(", ")} — archives can conceal executables`,
        kind: "fact",
      },
    ]);
  }

  // --- Authentication-Results header (as stamped by the receiving provider) ---
  const ar = email.authenticationResults?.toLowerCase() ?? "";
  const spfFail = /spf=(fail|softfail|permerror)/.test(ar);
  const dmarcFail = /dmarc=(fail|quarantine|reject)/.test(ar);
  const dkimFail = /dkim=(fail|none)/.test(ar) && ar.includes("dkim=");
  if (spfFail || dmarcFail) {
    const score = spfFail && dmarcFail ? 0.95 : spfFail ? 0.8 : 0.7;
    push("stub.auth-results", "spoofing", score, 0.8, [
      {
        label: "Authentication-Results",
        value: email.authenticationResults!.slice(0, 300),
        kind: "quote",
        ref: "Authentication-Results",
      },
      ...(spfFail
        ? [{ label: "SPF", value: "failed", kind: "fact" as const }]
        : []),
      ...(dmarcFail
        ? [{ label: "DMARC", value: "failed", kind: "fact" as const }]
        : []),
      ...(dkimFail
        ? [{ label: "DKIM", value: "failed / missing", kind: "fact" as const }]
        : []),
    ]);
  }

  // --- Reply-To / Return-Path domain mismatch ---
  const fromReg = email.senderDomain;
  const replyReg = email.replyTo
    ? getDomain(email.replyTo.split("@")[1] ?? "") ?? null
    : null;
  const returnReg = email.returnPath
    ? getDomain(email.returnPath.split("@")[1] ?? "") ?? null
    : null;
  if (replyReg && replyReg !== fromReg) {
    push("stub.reply-to-mismatch", "impersonation", 0.6, 0.7, [
      {
        label: "Reply-To differs from From",
        value: `From @${fromReg} but replies route to @${replyReg}`,
        kind: "comparison",
      },
    ]);
  } else if (returnReg && returnReg !== fromReg && !FREEMAIL.has(fromReg)) {
    push("stub.reply-to-mismatch", "spoofing", 0.45, 0.55, [
      {
        label: "Return-Path differs from From",
        value: `From @${fromReg}, envelope sender @${returnReg}`,
        kind: "comparison",
      },
    ]);
  }

  // --- Brand impersonation via display name ---
  const display = (email.fromDisplay ?? "").toLowerCase();
  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (!display.includes(brand)) continue;
    const legit = domains.some(
      (d) => fromReg === d || fromReg.endsWith(`.${d}`),
    );
    if (!legit) {
      push(
        "stub.impersonation",
        "impersonation",
        0.8,
        0.75,
        [
          {
            label: "Display name vs domain",
            value: `Claims "${email.fromDisplay}" but sends from @${fromReg} (not a ${brand} domain)`,
            kind: "comparison",
          },
        ],
        [brand],
      );
      break;
    }
  }

  // --- Subject / body language ---
  const subjectHit = URGENCY_RE.exec(email.subject);
  const bodyText = email.bodyText ?? "";
  const bodyUrgency = URGENCY_RE.exec(bodyText);
  if (subjectHit || bodyUrgency) {
    push("stub.urgency", "social_engineering", subjectHit ? 0.45 : 0.3, 0.5, [
      {
        label: "Urgency / pressure language",
        value: `"${(subjectHit?.[0] ?? bodyUrgency?.[0] ?? "").trim()}"`,
        kind: "quote",
        ref: subjectHit ? "Subject" : "Body",
      },
    ]);
  }

  const sensitive = SENSITIVE_RE.exec(bodyText);
  if (sensitive) {
    push("stub.sensitive-request", "phishing", 0.55, 0.6, [
      {
        label: "Requests sensitive information",
        value: `mentions "${sensitive[0]}"`,
        kind: "quote",
        ref: "Body",
      },
    ]);
  }

  const bec = BEC_RE.exec(bodyText) ?? BEC_RE.exec(email.subject);
  if (bec) {
    push("stub.bec-language", "bec", 0.65, 0.55, [
      {
        label: "BEC-style request",
        value: `"${bec[0].trim()}"`,
        kind: "quote",
      },
    ]);
  }

  // --- Links ---
  const shortened = email.urls.filter(
    (u) => u.host && SHORTENERS.has(u.host),
  );
  const nonHttps = email.urls.filter((u) => u.scheme === "http");
  const anchorMismatch = email.urls.filter((u) => {
    if (!u.anchorText || !u.host) return false;
    const claimed = u.anchorText.match(/([a-z0-9-]+\.)+[a-z]{2,}/i)?.[0];
    return claimed ? getDomain(claimed) !== getDomain(u.host) : false;
  });
  if (shortened.length || anchorMismatch.length || nonHttps.length >= 2) {
    const score = anchorMismatch.length ? 0.7 : shortened.length ? 0.5 : 0.3;
    push("stub.suspicious-links", "malicious_url", score, 0.55, [
      ...shortened.map((u) => ({
        label: "Shortened link",
        value: u.rawUrl,
        kind: "fact" as const,
        ref: u.rawUrl,
      })),
      ...anchorMismatch.map((u) => ({
        label: "Link text hides destination",
        value: `shows "${u.anchorText}" → ${u.host}`,
        kind: "comparison" as const,
      })),
      ...(nonHttps.length >= 2
        ? [
            {
              label: "Insecure links",
              value: `${nonHttps.length} http:// links`,
              kind: "metric" as const,
            },
          ]
        : []),
    ]);
  }

  return out;
}

export function analyzeStub(email: ParsedEmail): AnalysisOutcome {
  const results = detect(email);

  let raw = 0;
  let maxPossible = 0;
  const signals = results.map((r) => {
    const weight = DEFAULT_WEIGHTS[r.detectorId] ?? 0.5;
    const contribution = r.score * r.confidence * weight;
    raw += contribution;
    maxPossible += weight;
    return { ...r, weight, contribution };
  });

  let score = maxPossible ? Math.round((100 * raw) / maxPossible) : 0;
  if (signals.some((s) => s.triggered && s.severity === "critical")) {
    score = Math.max(score, 85);
  }
  score = Math.min(100, score);

  const band = scoreToBand(score, DEFAULT_BAND_THRESHOLDS);

  const triggered = signals
    .filter((s) => s.triggered)
    .sort((a, b) => b.contribution - a.contribution);

  const categories = [...new Set(triggered.map((s) => s.category))];

  const summary = buildSummary(band, score, triggered);

  return {
    score,
    band,
    categories,
    summary,
    signals,
    engineVersion: STUB_ENGINE_VERSION,
  };
}

function buildSummary(
  band: string,
  score: number,
  triggered: AnalysisOutcome["signals"],
): string {
  if (triggered.length === 0) {
    return `No notable threat indicators detected (${score}/100).`;
  }
  const top = triggered.slice(0, 3);
  const bits = top
    .map((s) => {
      const e = s.evidence[0];
      return e ? `${e.label.toLowerCase()} — ${e.value}` : s.detectorId;
    })
    .join("; ");
  return `Flagged ${band} (${score}/100). ${bits}.`;
}
