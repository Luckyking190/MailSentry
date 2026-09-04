import type { RiskBand } from "@prisma/client";
import { BAND_META } from "@/lib/scoring";

const SIZE = 120;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function ScoreGauge({ score, band }: { score: number; band: RiskBand }) {
  const meta = BAND_META[band];
  const offset = CIRC * (1 - score / 100);
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke="currentColor"
          strokeWidth={STROKE}
          fill="none"
          className="text-surface-2"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          className={meta.text}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums">{score}</span>
        <span className={`text-[11px] font-medium ${meta.text}`}>{meta.label}</span>
      </div>
    </div>
  );
}
