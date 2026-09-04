import type { RiskBand } from "@prisma/client";

import { scoreToBand, type SignalCategory } from "@/lib/scoring";
import type {
  DetectorContext,
  DetectorResult,
  ScoredSignal,
} from "./types";

export type Aggregated = {
  score: number;
  band: RiskBand;
  categories: SignalCategory[];
  signals: ScoredSignal[];
};

/**
 * contribution_i = score_i · confidence_i · weight_i
 * score          = 100 · Σ contribution / Σ weight
 *
 * A detector reporting `confidence: 0` (e.g. an LLM detector when the LLM
 * layer is disabled/degraded) is treated as "did not run" and excluded from
 * the denominator entirely, so a disabled layer never dilutes the score.
 *
 * The weighted average alone under-scores a message with one or two very
 * strong findings and many clean checks (a real SPF+DMARC spoof shouldn't
 * read as "low risk" just because attachments/URLs were clean). So each
 * triggered signal's severity guarantees a floor at that severity's own band
 * threshold — one critical finding is enough to land in the critical band,
 * one high finding is enough to land in the high band, and so on — while the
 * weighted average still determines the score *within* that floor and can
 * push it higher when multiple signals corroborate.
 */
export function aggregate(
  results: DetectorResult[],
  ctx: Pick<DetectorContext, "settings">,
  weightFor: (id: string) => number,
): Aggregated {
  let raw = 0;
  let maxPossible = 0;

  const signals: ScoredSignal[] = results.map((r) => {
    const weight = weightFor(r.detectorId);
    const contribution = r.triggered ? r.score * r.confidence * weight : 0;
    raw += contribution;
    if (r.confidence > 0) maxPossible += weight;
    return { ...r, weight, contribution };
  });

  let score = maxPossible > 0 ? Math.round((100 * raw) / maxPossible) : 0;

  // No floor for "low" severity — a single weak/circumstantial finding
  // shouldn't alone force a clean message out of the SAFE band; it still
  // pulls the weighted average up a little, which is enough.
  const t = ctx.settings.bandThresholds;
  const SEVERITY_FLOOR: Record<string, number> = {
    critical: t.critical,
    high: t.high,
    medium: t.medium,
  };
  for (const s of signals) {
    if (!s.triggered) continue;
    const floor = SEVERITY_FLOOR[s.severity];
    if (floor !== undefined) score = Math.max(score, floor);
  }
  score = Math.min(100, Math.max(0, score));

  const band = scoreToBand(score, ctx.settings.bandThresholds);

  const categories = [
    ...new Set(
      signals
        .filter((s) => s.triggered)
        .sort((a, b) => b.contribution - a.contribution)
        .map((s) => s.category),
    ),
  ];

  return { score, band, categories, signals };
}
