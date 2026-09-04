import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

export const nlpContentDetector: Detector = {
  id: "llm.content",
  category: "phishing",
  defaultWeight: 0.16,

  run(ctx): DetectorResult {
    if (!ctx.llm) return disabled();
    if (!ctx.llm.data) return degraded();

    const c = ctx.llm.data.content;
    const evidence: Evidence[] = [];
    let score = c.phishing_likelihood;

    if (c.requests_sensitive_info) {
      score = Math.max(score, 0.6);
      evidence.push({
        label: "Requests sensitive information",
        value: c.sensitive_info_types.length
          ? c.sensitive_info_types.join(", ")
          : "unspecified sensitive data",
        kind: "fact",
      });
    }
    if (c.contains_threat) {
      score = Math.max(score, 0.5);
      evidence.push({ label: "Contains a threat", value: "account/legal/financial threat language", kind: "fact" });
    }
    if (c.contains_reward_bait) {
      score = Math.max(score, 0.45);
      evidence.push({ label: "Reward bait", value: "promises a prize, refund, or reward", kind: "fact" });
    }
    if (c.impersonated_entity) {
      score = Math.max(score, 0.55);
      evidence.push({
        label: "Impersonates",
        value: c.impersonated_entity,
        kind: "fact",
      });
    }
    if (c.emotional_manipulation.length) {
      evidence.push({
        label: "Manipulation tactics",
        value: c.emotional_manipulation.join(", "),
        kind: "fact",
      });
    }
    if (c.writing_quality === "poor" || c.writing_quality === "machine_generated") {
      score = Math.max(score, 0.3);
      evidence.push({
        label: "Writing quality",
        value: c.writing_quality.replace("_", " "),
        kind: "fact",
      });
    }
    for (const p of c.suspicious_phrases.slice(0, 2)) {
      evidence.push({ label: p.why || "Suspicious phrasing", value: `"${p.quote}"`, kind: "quote" });
    }
    if (c.rationale) evidence.push({ label: "Assessment", value: c.rationale, kind: "fact" });

    return {
      detectorId: "llm.content",
      category: "phishing",
      triggered: score >= 0.2,
      score,
      confidence: 0.75,
      severity: severityFromScore(score),
      evidence: evidence.slice(0, 8),
    };
  },
};

function disabled(): DetectorResult {
  return {
    detectorId: "llm.content",
    category: "phishing",
    triggered: false,
    score: 0,
    confidence: 0,
    severity: "info",
    evidence: [],
  };
}

function degraded(): DetectorResult {
  return {
    detectorId: "llm.content",
    category: "phishing",
    triggered: false,
    score: 0,
    confidence: 0,
    severity: "info",
    evidence: [{ label: "AI analysis", value: "unavailable for this message", kind: "fact" }],
    tags: ["llm-degraded"],
  };
}
