import type { RiskBand } from "@prisma/client";
import { BAND_META, CATEGORY_LABEL, type SignalCategory } from "@/lib/scoring";
import type { ScoredSignal } from "./types";

/**
 * Deterministic, LLM-free explanation. Leads with the top category, quotes the
 * two or three most damning evidence items verbatim, and states the band.
 */
export function composeSummary(
  band: RiskBand,
  score: number,
  signals: ScoredSignal[],
): string {
  const triggered = signals
    .filter((s) => s.triggered)
    .sort((a, b) => b.contribution - a.contribution);

  if (triggered.length === 0) {
    return `No notable threat indicators were found. Sender authentication, links, attachments, and language all looked normal (${score}/100).`;
  }

  const topCategory = triggered[0].category as SignalCategory;
  const lead = `Flagged ${BAND_META[band].label.toLowerCase()} (${score}/100) — primarily ${CATEGORY_LABEL[topCategory].toLowerCase()}.`;

  const points: string[] = [];
  for (const sig of triggered.slice(0, 3)) {
    const e = sig.evidence[0];
    if (!e) continue;
    points.push(
      e.kind === "quote"
        ? `${e.label}: ${e.value}`
        : `${e.label} — ${e.value}`,
    );
  }

  return points.length ? `${lead} ${points.join(". ")}.` : lead;
}
