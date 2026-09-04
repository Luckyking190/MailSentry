import { cn } from "@/lib/utils";

export type HopRow = {
  hopIndex: number;
  ip: string;
  fromHost: string | null;
  byHost: string | null;
  ptr: string | null;
  city: string | null;
  country: string | null;
  org: string | null;
  timestamp: string | null;
  isTrustedOrigin: boolean;
  unverified: boolean;
};

function fmtTime(iso: string | null): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "unknown time"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
}

export function HopTimeline({ hops }: { hops: HopRow[] }) {
  if (hops.length === 0) {
    return (
      <p className="text-xs text-muted">
        No public relay hops were found in this message&apos;s headers.
      </p>
    );
  }

  // Oldest (sender) first, newest (delivery) last.
  const ordered = [...hops].sort((a, b) => b.hopIndex - a.hopIndex);

  return (
    <ol className="relative ml-2 border-l border-border pl-5">
      {ordered.map((h) => (
        <li key={h.hopIndex} className="mb-5 last:mb-0">
          <span
            className={cn(
              "absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface",
              h.isTrustedOrigin ? "bg-rose-500" : "bg-brand",
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-foreground">{h.ip}</span>
            {h.isTrustedOrigin && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-rose-500/30">
                originating server
              </span>
            )}
            {h.unverified && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                unverified / possibly forged
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[h.city, h.country].filter(Boolean).join(", ") || "Unknown location"}
            {h.org ? ` · ${h.org}` : ""}
          </p>
          <p className="text-xs text-muted">
            {h.fromHost ?? "unknown host"}
            {h.byHost ? ` → ${h.byHost}` : ""}
            {h.ptr ? ` (PTR: ${h.ptr})` : ""}
          </p>
          <p className="text-[11px] text-muted/80">{fmtTime(h.timestamp)}</p>
        </li>
      ))}
    </ol>
  );
}
