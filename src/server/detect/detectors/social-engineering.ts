import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const TACTIC_LABEL: Record<string, string> = {
  pretexting: "Pretexting (a fabricated scenario)",
  baiting: "Baiting",
  quid_pro_quo: "Quid pro quo",
  authority_impersonation: "Authority impersonation",
  urgency_manufacturing: "Manufactured urgency",
  trust_exploitation: "Trust exploitation",
  fear_appeal: "Fear appeal",
  familiarity_exploitation: "False familiarity",
};

export const socialEngineeringDetector: Detector = {
  id: "llm.social",
  category: "social_engineering",
  defaultWeight: 0.13,

  run(ctx): DetectorResult {
    if (!ctx.llm?.data) return quiet();

    const s = ctx.llm.data.social;
    const score = s.social_engineering_score;
    if (score < 0.25 && s.tactics.length === 0) return quiet();

    const evidence: Evidence[] = [];
    if (s.tactics.length) {
      evidence.push({
        label: "Tactics used",
        value: s.tactics.map((t) => TACTIC_LABEL[t] ?? t).join(", "),
        kind: "fact",
      });
    }
    if (s.pretext_summary) {
      evidence.push({ label: "Pretext", value: s.pretext_summary, kind: "fact" });
    }
    if (s.call_to_action) {
      evidence.push({ label: "Call to action", value: s.call_to_action, kind: "fact" });
    }
    for (const q of s.evidence_quotes.slice(0, 2)) {
      evidence.push({ label: "Quote", value: `"${q}"`, kind: "quote" });
    }

    return {
      detectorId: "llm.social",
      category: "social_engineering",
      triggered: score >= 0.25 || s.tactics.length > 0,
      score: Math.max(score, s.tactics.length ? 0.35 : 0),
      confidence: 0.65,
      severity: severityFromScore(score),
      evidence: evidence.slice(0, 6),
      tags: s.tactics,
    };
  },
};

function quiet(): DetectorResult {
  return {
    detectorId: "llm.social",
    category: "social_engineering",
    triggered: false,
    score: 0,
    confidence: 0,
    severity: "info",
    evidence: [],
  };
}
