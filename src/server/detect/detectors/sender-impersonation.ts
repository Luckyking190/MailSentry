import { brandsInDisplayName } from "@/server/watchlist/brands";
import type { Detector, DetectorResult, Evidence } from "../types";
import {
  CORP_TITLE_RE,
  FREEMAIL_DOMAINS,
  registrableDomain,
  severityFromScore,
} from "./_util";

const EMAIL_IN_DISPLAY_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

export const senderImpersonationDetector: Detector = {
  id: "sender.impersonation",
  category: "impersonation",
  defaultWeight: 0.2,

  run(ctx): DetectorResult {
    const { email, spfCheck } = ctx;
    const evidence: Evidence[] = [];
    let score = 0;
    let confidence = 0.7;
    const tags: string[] = [];

    const fromDom = email.senderDomain;
    const display = email.fromDisplay ?? "";

    // 1. Brand name in display, domain not owned by that brand.
    for (const brand of brandsInDisplayName(display)) {
      const legit = brand.domains.some(
        (d) => fromDom === d || fromDom.endsWith(`.${d}`),
      );
      if (!legit) {
        score = Math.max(score, 0.8);
        tags.push(brand.name);
        evidence.push({
          label: "Display name vs sender domain",
          value: `Presents as "${display}" but the address is @${fromDom}, which is not a ${brand.name} domain`,
          kind: "comparison",
        });
        break;
      }
    }

    // 2. Display name embeds a different email address than the real From.
    const embedded = display.match(EMAIL_IN_DISPLAY_RE)?.[1]?.toLowerCase();
    if (embedded && embedded !== email.fromAddress) {
      const embDom = registrableDomain(embedded);
      if (embDom && embDom !== fromDom) {
        score = Math.max(score, 0.7);
        evidence.push({
          label: "Spoofed display name",
          value: `Shows "${embedded}" but actually sent from ${email.fromAddress}`,
          kind: "comparison",
        });
      }
    }

    // 3. Reply-To routes to a different domain than From.
    const replyDom = registrableDomain(email.replyTo);
    if (replyDom && replyDom !== fromDom) {
      score = Math.max(score, 0.58);
      evidence.push({
        label: "Reply-To mismatch",
        value: `From @${fromDom}, but replies are directed to @${replyDom}`,
        kind: "comparison",
      });
    }

    // 4. Freemail sender claiming an executive / finance identity.
    if (FREEMAIL_DOMAINS.has(fromDom)) {
      const roleHit =
        CORP_TITLE_RE.exec(display) ||
        CORP_TITLE_RE.exec(email.subject) ||
        CORP_TITLE_RE.exec(email.bodyText?.slice(0, 500) ?? "");
      if (roleHit) {
        score = Math.max(score, 0.5);
        confidence = 0.6;
        tags.push("freemail-exec");
        evidence.push({
          label: "Freemail sender, authority claim",
          value: `Sent from a personal ${fromDom} address while presenting as "${roleHit[0]}"`,
          kind: "fact",
        });
      }
    }

    // Escalate if the message also fails SPF.
    let severityScore = score;
    if (score >= 0.5 && spfCheck?.result === "fail") {
      severityScore = Math.max(severityScore, 0.85);
      evidence.push({
        label: "Corroboration",
        value: "SPF also fails — the sender identity is both mismatched and forged",
        kind: "comparison",
      });
    }

    return {
      detectorId: "sender.impersonation",
      category: "impersonation",
      triggered: score > 0,
      score: severityScore,
      confidence,
      severity: severityFromScore(severityScore),
      evidence,
      tags: tags.length ? tags : undefined,
    };
  },
};
