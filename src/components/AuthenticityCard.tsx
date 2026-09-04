import { cn } from "@/lib/utils";

type Verdict = string | null;

function chipTone(v: Verdict): string {
  if (!v) return "bg-surface-2 text-muted ring-border";
  if (v === "pass") return "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30";
  if (v === "fail" || v === "permerror") return "bg-rose-500/10 text-rose-300 ring-rose-500/30";
  return "bg-amber-500/10 text-amber-300 ring-amber-500/30";
}

function Chip({ label, value }: { label: string; value: Verdict }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        chipTone(value),
      )}
    >
      {label}: {value ?? "n/a"}
    </span>
  );
}

export function AuthenticityCard({
  spf,
  dkim,
  dmarc,
  originCountry,
  hopCount,
  originObscured,
  hasUnverifiedHops,
}: {
  spf: Verdict;
  dkim: Verdict;
  dmarc: Verdict;
  originCountry: string | null;
  hopCount: number;
  originObscured: boolean;
  hasUnverifiedHops: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip label="SPF" value={spf} />
      <Chip label="DKIM" value={dkim} />
      <Chip label="DMARC" value={dmarc} />
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted ring-1 ring-border">
        {hopCount} relay{hopCount === 1 ? "" : "s"}
      </span>
      {originCountry && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted ring-1 ring-border">
          origin: {originCountry}
        </span>
      )}
      {originObscured && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-500/30">
          origin hidden behind relays
        </span>
      )}
      {hasUnverifiedHops && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-500/30">
          headers below trust boundary
        </span>
      )}
    </div>
  );
}
