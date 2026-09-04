import { cn } from "@/lib/utils";
import { DETECTOR_LABEL } from "@/lib/detectorLabels";

export type SignalView = {
  id: string;
  detectorId: string;
  category: string;
  triggered: boolean;
  severity: string;
  contribution: number;
  evidence: { label: string; value: string; kind: string }[];
  tags: string[];
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  high: "bg-orange-500/10 text-orange-300 ring-orange-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  low: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  info: "bg-surface-2 text-muted ring-border",
};

export function SignalBlock({
  signal,
  maxContribution,
}: {
  signal: SignalView;
  maxContribution: number;
}) {
  const pct = maxContribution > 0 ? Math.round((signal.contribution / maxContribution) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {DETECTOR_LABEL[signal.detectorId] ?? signal.detectorId}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
            SEVERITY_TONE[signal.severity] ?? SEVERITY_TONE.info,
          )}
        >
          {signal.severity}
        </span>
      </div>

      {signal.contribution > 0 && (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      )}

      {signal.evidence.length > 0 ? (
        <ul className="space-y-1">
          {signal.evidence.map((e, i) => (
            <li key={i} className="text-xs text-muted">
              <span className="text-foreground">{e.label}:</span>{" "}
              {e.kind === "quote" ? <em>{e.value}</em> : e.value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Nothing notable found.</p>
      )}
    </div>
  );
}
