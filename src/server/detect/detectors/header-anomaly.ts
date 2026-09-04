import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const DAY_MS = 86_400_000;

export const headerAnomalyDetector: Detector = {
  id: "header.anomaly",
  category: "header_anomaly",
  defaultWeight: 0.12,

  run(ctx): DetectorResult {
    const { email, received, authResults, spfCheck } = ctx;
    const evidence: Evidence[] = [];
    let score = 0;

    // 1. No Received headers — locally injected or hand-crafted.
    if (received.hops.length === 0) {
      score = Math.max(score, 0.5);
      evidence.push({
        label: "No transit headers",
        value: "message has no Received: chain",
        kind: "fact",
      });
    }

    // 2. Missing Message-ID.
    if (!email.messageIdHdr) {
      score = Math.max(score, 0.3);
      evidence.push({
        label: "Missing Message-ID",
        value: "legitimate MTAs almost always add one",
        kind: "fact",
      });
    }

    // 3. Date header far from the earliest hop timestamp.
    const hopTimes = received.hops
      .map((h) => h.timestamp?.getTime())
      .filter((t): t is number => typeof t === "number");
    if (email.sentAt && hopTimes.length) {
      const earliest = Math.min(...hopTimes);
      const skew = Math.abs(email.sentAt.getTime() - earliest);
      if (skew > 2 * DAY_MS) {
        score = Math.max(score, 0.4);
        evidence.push({
          label: "Date / transit mismatch",
          value: `Date header is ${Math.round(skew / DAY_MS)} days from the first relay timestamp`,
          kind: "metric",
        });
      }
    }

    // 4. Non-monotonic hop timestamps (older hop stamped later).
    for (let i = 1; i < received.hops.length; i++) {
      const newer = received.hops[i - 1].timestamp?.getTime();
      const older = received.hops[i].timestamp?.getTime();
      if (newer && older && older - newer > 5 * 60_000) {
        score = Math.max(score, 0.4);
        evidence.push({
          label: "Received chain time travel",
          value: "a later hop is timestamped before an earlier one",
          kind: "fact",
        });
        break;
      }
    }

    // 5. Forgeable headers below the trusted boundary.
    if (
      received.unverifiedFromIndex !== null &&
      received.hops.length > received.unverifiedFromIndex
    ) {
      const n = received.hops.length - received.unverifiedFromIndex;
      score = Math.max(score, 0.35);
      evidence.push({
        label: "Unverified relay headers",
        value: `${n} Received header${n === 1 ? "" : "s"} predate the first trusted relay and may be forged`,
        kind: "fact",
      });
    } else if (received.originObscured) {
      score = Math.max(score, 0.2);
      evidence.push({
        label: "Origin obscured",
        value: "the true sending server is hidden behind provider relays",
        kind: "fact",
      });
    }

    // 6. Our SPF verdict disagrees with the provider-stamped one.
    if (
      spfCheck?.result &&
      authResults.spf &&
      spfCheck.result !== authResults.spf &&
      (spfCheck.result === "fail" || authResults.spf === "fail")
    ) {
      score = Math.max(score, 0.6);
      evidence.push({
        label: "Authentication-Results disagreement",
        value: `provider recorded spf=${authResults.spf}, re-check says spf=${spfCheck.result}`,
        kind: "comparison",
      });
    }

    return {
      detectorId: "header.anomaly",
      category: "header_anomaly",
      triggered: score > 0,
      score,
      confidence: 0.6,
      severity: severityFromScore(score),
      evidence,
    };
  },
};
