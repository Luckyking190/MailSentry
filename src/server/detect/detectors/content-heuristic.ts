import type { Detector, DetectorResult, Evidence } from "../types";
import { severityFromScore } from "./_util";

const URGENCY_RE =
  /\b(urgent|immediate action|act now|action required|verify your account|payment (failed|declined)|security alert|final notice|account (has been )?(locked|suspended|disabled|compromised)|within \d+ hours?|confirm your (identity|account|password)|update your (payment|billing) (info|information|details)|failure to (comply|respond)|avoid (suspension|closure))\b/i;
const SENSITIVE_RE =
  /\b(password|one[-\s]?time\s?(code|password|pin)|otp|\bssn\b|social security number|bank account (number|details)|routing number|credit card( number)?|cvv|card verification|login credentials|verify your (identity|card))\b/i;
const BEC_RE =
  /\b(change (the |our )?(bank|payment|account|wire) (details|account|information)|update (the |our )?(wire|payment|banking) (instructions|details)|process (this|the|an urgent) payment|pay (this|the) invoice (urgently|today)|purchase .*?gift cards?|buy .*?gift cards?|are you (available|at your desk|in the office)|need you to (handle|do) a (quick|small) (task|favou?r)|send me your (personal )?(cell|mobile|phone|number)|wire transfer (of|for)|remit(tance)? to a new)\b/i;
const REWARD_RE =
  /\b(you(?:'ve| have) won|congratulations,? you|claim your (prize|reward|refund|gift)|selected (as a )?winner|tax refund of|inheritance of|lottery|beneficiary)\b/i;

export const contentHeuristicDetector: Detector = {
  id: "content.heuristic",
  category: "phishing",
  defaultWeight: 0.14,

  run(ctx): DetectorResult {
    const { subject } = ctx.email;
    const body = ctx.email.bodyText ?? "";
    const haystack = `${subject}\n${body}`;
    const evidence: Evidence[] = [];
    let score = 0;
    let category: DetectorResult["category"] = "phishing";
    const tags: string[] = [];

    const urgency = URGENCY_RE.exec(subject) ?? URGENCY_RE.exec(body);
    if (urgency) {
      score = Math.max(score, URGENCY_RE.exec(subject) ? 0.42 : 0.3);
      category = "social_engineering";
      evidence.push({
        label: "Urgency / pressure",
        value: `"${urgency[0].trim()}"`,
        kind: "quote",
        ref: URGENCY_RE.exec(subject) ? "Subject" : "Body",
      });
    }

    const sensitive = SENSITIVE_RE.exec(haystack);
    if (sensitive) {
      score = Math.max(score, 0.55);
      category = "phishing";
      evidence.push({
        label: "Requests sensitive information",
        value: `mentions "${sensitive[0]}"`,
        kind: "quote",
        ref: "Body",
      });
    }

    const bec = BEC_RE.exec(haystack);
    if (bec) {
      score = Math.max(score, 0.68);
      category = "bec";
      tags.push("bec-language");
      evidence.push({
        label: "Business-email-compromise language",
        value: `"${bec[0].trim()}"`,
        kind: "quote",
      });
    }

    const reward = REWARD_RE.exec(haystack);
    if (reward) {
      score = Math.max(score, 0.5);
      if (category === "phishing") category = "social_engineering";
      evidence.push({
        label: "Too-good-to-be-true reward",
        value: `"${reward[0].trim()}"`,
        kind: "quote",
      });
    }

    return {
      detectorId: "content.heuristic",
      category,
      triggered: score > 0,
      score,
      confidence: 0.5,
      severity: severityFromScore(score),
      evidence,
      tags: tags.length ? tags : undefined,
    };
  },
};
