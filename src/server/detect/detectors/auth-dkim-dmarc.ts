import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

export const authDkimDmarcDetector: Detector = {
  id: "auth.dkim-dmarc",
  category: "spoofing",
  defaultWeight: 0.16,

  run(ctx): DetectorResult {
    const { authResults, spfCheck } = ctx;
    const evidence: Evidence[] = [];
    let score = 0;
    let confidence = 0.75;

    const dmarcFail =
      authResults.dmarc === "fail" ||
      authResults.dmarc === "policy" ||
      authResults.dmarc === "permerror";
    const dkimFail = authResults.dkim === "fail" || authResults.dkim === "permerror";
    const dkimMissing = authResults.dkim === "none" || authResults.dkim === null;

    if (dmarcFail) {
      score = Math.max(score, 0.8);
      evidence.push({
        label: "DMARC",
        value: `${authResults.dmarc}${authResults.dmarcDomain ? ` (header.from=${authResults.dmarcDomain})` : ""}`,
        kind: "fact",
        ref: "Authentication-Results",
      });
    }

    if (dkimFail) {
      score = Math.max(score, 0.55);
      evidence.push({
        label: "DKIM",
        value: `signature failed verification${authResults.dkimDomain ? ` (d=${authResults.dkimDomain})` : ""}`,
        kind: "fact",
        ref: "Authentication-Results",
      });
    }

    // SPF (our check) + DMARC both failing ⇒ near-certain spoof.
    if (dmarcFail && spfCheck?.result === "fail") {
      score = Math.max(score, 0.95);
      confidence = 0.85;
      evidence.push({
        label: "Combined",
        value: "SPF and DMARC both fail for the claimed sender domain",
        kind: "comparison",
      });
    }

    // Nothing published at all.
    if (
      !dmarcFail &&
      !dkimFail &&
      dkimMissing &&
      (authResults.dmarc === "none" || authResults.dmarc === null) &&
      (authResults.spf === "none" || authResults.spf === null) &&
      !spfCheck?.record
    ) {
      score = Math.max(score, 0.25);
      confidence = 0.5;
      evidence.push({
        label: "Email authentication",
        value: "sender domain publishes no SPF, DKIM, or DMARC — trivially spoofable",
        kind: "fact",
      });
    }

    if (authResults.raw && score > 0) {
      evidence.push({
        label: "Authentication-Results",
        value:
          authResults.raw.length > 220
            ? `${authResults.raw.slice(0, 220)}…`
            : authResults.raw,
        kind: "quote",
      });
    }

    return {
      detectorId: "auth.dkim-dmarc",
      category: "spoofing",
      triggered: score > 0,
      score,
      confidence,
      severity: severityFromScore(score),
      evidence,
    };
  },
};
