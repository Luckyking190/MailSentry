"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { countryFlag, countryName } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { OriginPoint } from "./OriginMap";

// Leaflet touches `window` at import time, so it can only load in the browser.
const OriginMap = dynamic(() => import("./OriginMap").then((m) => m.OriginMap), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg bg-surface-2" />,
});

export type CountryRow = { country: string | null; count: number };

/**
 * "Where is this mail coming from?" in two readings of the same data: a ranked
 * list for exact comparison, a world map for spread. The toggle is local
 * state — switching views should never re-query.
 */
export function OriginLocations({
  rows,
  points,
  total,
}: {
  rows: CountryRow[];
  points: OriginPoint[];
  total: number;
}) {
  const [view, setView] = useState<"list" | "map">("list");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">Top incoming mail locations</p>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-[11px] text-muted/60">{total} geolocated</span>
          )}
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors",
                  view === v
                    ? "bg-surface-3 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "map" ? (
        <OriginMap points={points} />
      ) : total === 0 ? (
        <p className="py-6 text-center text-xs text-muted/70">
          No origin geography yet — it is resolved from each message&apos;s
          earliest trusted mail server during a scan.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const pct = Math.round((row.count / total) * 100);
            return (
              <div key={row.country} className="flex items-center gap-3 text-xs">
                <span
                  className="flex w-36 shrink-0 items-center gap-1.5 truncate"
                  title={countryName(row.country)}
                >
                  <span aria-hidden className="text-sm leading-none">
                    {countryFlag(row.country)}
                  </span>
                  <span className="truncate text-muted">{countryName(row.country)}</span>
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right tnum text-muted">
                  {row.count}
                  <span className="ml-1 text-muted/50">{pct}%</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
