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
 * plus a hard floor of 85 when any triggered signal is `critical`.
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
    maxPossible += weight;
    return { ...r, weight, contribution };
  });

  let score = maxPossible > 0 ? Math.round((100 * raw) / maxPossible) : 0;
  if (signals.some((s) => s.triggered && s.severity === "critical")) {
    score = Math.max(score, 85);
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
