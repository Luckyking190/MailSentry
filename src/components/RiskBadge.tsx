import type { RiskBand } from "@prisma/client";
import { BAND_META } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export function RiskBadge({
  band,
  score,
  className,
}: {
  band: RiskBand;
  score?: number;
  className?: string;
}) {
  const meta = BAND_META[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        meta.bg,
        meta.text,
        meta.ring,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
      {typeof score === "number" && (
        <span className="tabular-nums opacity-70">{score}</span>
      )}
    </span>
  );
}
