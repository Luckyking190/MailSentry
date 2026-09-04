import { cn } from "@/lib/utils";

type Tone = "neutral" | "warn" | "danger" | "good";

const TONE: Record<Tone, { value: string; glow: string; dot: string }> = {
  neutral: { value: "text-foreground", glow: "from-brand/12", dot: "bg-brand" },
  good: { value: "text-safe", glow: "from-safe/12", dot: "bg-safe" },
  warn: { value: "text-high", glow: "from-high/12", dot: "bg-high" },
  danger: { value: "text-critical", glow: "from-critical/12", dot: "bg-critical" },
};

/**
 * A single headline number. The value carries the tone colour and the label
 * stays muted, so a row of tiles reads as data first and chrome second.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="sheen relative overflow-hidden rounded-xl border border-border bg-surface p-4">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
          t.glow,
        )}
      />
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", t.dot)} />
          <p className="text-xs text-muted">{label}</p>
        </div>
        <p className={cn("mt-2 text-3xl font-semibold tnum tracking-tight", t.value)}>
          {value}
        </p>
        {hint && <p className="mt-1 text-[11px] text-muted/80">{hint}</p>}
      </div>
    </div>
  );
}
