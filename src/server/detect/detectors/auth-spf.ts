import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const SPF_SCORE: Record<string, number> = {
  fail: 0.9,
  permerror: 0.7,
  softfail: 0.6,
  neutral: 0.3,
  none: 0.3,
  temperror: 0.15,
};

export const authSpfDetector: Detector = {
  id: "auth.spf",
  category: "spoofing",
  defaultWeight: 0.18,

  run(ctx): DetectorResult {
    const { email, spfCheck, authResults, received } = ctx;
    const evidence: Evidence[] = [];

    // Prefer our own re-check (DNS + originating IP). A "temperror" from the
    // live check means our resolver couldn't reach DNS (timeout/SERVFAIL) —
    // that's not a policy verdict, so fall back to the provider-stamped
    // result (already evaluated at delivery time) when we have one.
    const ourResult = spfCheck?.result ?? null;
    const stamped = authResults.spf;
    const liveUnreliable = ourResult === "temperror" || ourResult === null;
    const effective = liveUnreliable ? (stamped ?? ourResult) : ourResult;

    if (!effective || effective === "pass" || effective === "bestguesspass") {
      return base(ctx, false, 0, 0.4, [
        {
          label: "SPF",
          value: effective === "pass" ? "pass" : "not evaluated",
          kind: "fact",
        },
      ]);
    }

    let score = SPF_SCORE[effective] ?? 0.4;

    if (spfCheck?.clientIp) {
      evidence.push({
        label: "Originating IP",
        value: spfCheck.clientIp,
        kind: "fact",
        ref: "Received",
      });
    }
    evidence.push({
      label: "SPF result",
      value:
        `${effective}` +
        (spfCheck?.comment ? ` — ${spfCheck.comment}` : "") +
        (ourResult && stamped && ourResult !== stamped
          ? ` (provider recorded "${stamped}")`
          : ""),
      kind: "fact",
      ref: "SPF",
    });
    if (spfCheck?.record) {
      evidence.push({
        label: `SPF record for ${email.senderDomain}`,
        value:
          spfCheck.record.length > 180
            ? `${spfCheck.record.slice(0, 180)}…`
            : spfCheck.record,
        kind: "quote",
      });
    } else if (effective === "none" || effective === "neutral") {
      evidence.push({
        label: "SPF policy",
        value: `${email.senderDomain} publishes no enforced SPF record`,
        kind: "fact",
      });
    }

    // Hard fail from a domain that does publish SPF = active spoofing.
    if (effective === "fail" && spfCheck?.record) {
      score = Math.max(score, 0.95);
    }
    // If the true origin is hidden we can't be certain.
    const confidence = received.originObscured ? 0.55 : spfCheck ? 0.85 : 0.6;

    return base(ctx, true, score, confidence, evidence);
  },
};

function base(
  ctx: Parameters<Detector["run"]>[0],
  triggered: boolean,
  score: number,
  confidence: number,
  evidence: Evidence[],
): DetectorResult {
  return {
    detectorId: "auth.spf",
    category: "spoofing",
    triggered,
    score,
    confidence,
    severity: severityFromScore(triggered ? score : 0),
    evidence,
  };
}
