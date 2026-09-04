"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BAND_META, BAND_ORDER } from "@/lib/scoring";
import type { RiskBand } from "@prisma/client";

type Progress = {
  jobId: string;
  phase: string;
  total: number;
  processed: number;
  failed: number;
  bandHistogram: Record<string, number>;
  done: boolean;
  error: string | null;
};

const PHASE_COPY: Record<string, string> = {
  QUEUED: "Preparing scan…",
  LISTING: "Listing messages in your mailbox…",
  FETCHING: "Downloading message contents…",
  ANALYZING: "Scoring messages for phishing, spoofing & BEC…",
  DOMAIN_INTEL: "Checking sender domains & SPF records…",
  DONE: "Scan complete",
  FAILED: "Scan failed",
};

const ROTATING = [
  "Parsing headers and Received chains…",
  "Resolving sender domains…",
  "Inspecting links and attachments…",
  "Checking display names against domains…",
  "Looking for urgency and BEC language…",
];

export function ScanRunner({
  initial,
  mode = "gmail",
  compact = false,
}: {
  initial: Progress | null;
  mode?: "gmail" | "demo";
  /** Banner variant rendered on the dashboard while a scan runs in the background. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(ROTATING[0]);
  const loopingRef = useRef(false);

  const runLoop = useCallback(
    async (jobId: string) => {
      if (loopingRef.current) return;
      loopingRef.current = true;
      setRunning(true);
      setError(null);
      try {
        for (;;) {
          const res = await fetch("/api/scan/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId }),
          });
          const data = (await res.json()) as Progress & { error?: string };
          if (!res.ok) {
            setError(data.error ?? "Scan failed");
            break;
          }
          setProgress(data);
          // Each tick has already committed its batch, so re-render the
          // server components around us and the dashboard fills in live.
          if (compact) router.refresh();
          if (data.done) {
            if (data.phase === "DONE") {
              if (compact) router.refresh();
              else setTimeout(() => router.push("/dashboard"), 1200);
            }
            break;
          }
          // Hand over to the dashboard as soon as there are results to show —
          // it keeps ticking from there, so the rest of the scan happens
          // behind a usable page instead of a progress bar.
          if (!compact && data.processed > 0) {
            router.push("/dashboard");
            break;
          }
        }
      } catch {
        setError("Lost connection during scan. Reload to resume.");
      } finally {
        loopingRef.current = false;
        setRunning(false);
      }
    },
    [router, compact],
  );

  const loadDemo = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      const res = await fetch("/api/demo/load", { method: "POST" });
      const data = (await res.json()) as Progress & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load the demo mailbox");
        return;
      }
      setProgress(data);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch {
      setError("Lost connection while loading the demo mailbox.");
    } finally {
      setRunning(false);
    }
  }, [router]);

  const start = useCallback(
    async (force = false) => {
      if (mode === "demo") return loadDemo();
      setError(null);
      const res = await fetch("/api/scan/start", { method: "POST" });
      const data = (await res.json()) as Progress & { error?: string };
      if (!res.ok) {
        setError(
          data.error === "ReauthRequired"
            ? "Your Google session expired — sign in again."
            : (data.error ?? "Could not start scan"),
        );
        return;
      }
      setProgress(data);
      if (!data.done) void runLoop(data.jobId);
      else if (force) void runLoop(data.jobId);
    },
    [runLoop, mode, loadDemo],
  );

  // Kick off / resume on mount (deferred so we don't setState during the effect).
  useEffect(() => {
    const id = setTimeout(() => {
      if (mode === "demo") {
        void loadDemo();
      } else if (!initial) {
        void start();
      } else if (!initial.done) {
        void runLoop(initial.jobId);
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotating tips while running.
  useEffect(() => {
    if (!running) return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % ROTATING.length;
      setTip(ROTATING[i]);
    }, 2500);
    return () => clearInterval(t);
  }, [running]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : progress?.done
        ? 100
        : 0;

  const isDone = progress?.done && progress.phase === "DONE";
  const isFailed = progress?.phase === "FAILED" || !!error;

  if (compact) {
    if (isDone || (!progress && !error)) return null;
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {isFailed
              ? (error ?? "Scan failed — results below are partial.")
              : `${tip} Results appear here as they are scored.`}
          </p>
          <p className="shrink-0 text-xs tabular-nums text-muted">
            {progress ? `${progress.processed}/${progress.total || "…"}` : "…"}
          </p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFailed ? "bg-rose-500" : "bg-brand"
            }`}
            style={{ width: `${isFailed ? 100 : pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium">
            {isFailed
              ? "Scan failed"
              : isDone
                ? "Scan complete"
                : (PHASE_COPY[progress?.phase ?? "QUEUED"] ?? "Scanning…")}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {progress ? `${progress.processed}/${progress.total || "…"}` : "…"}
          </p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFailed ? "bg-rose-500" : "bg-brand"
            }`}
            style={{ width: `${isFailed ? 100 : pct}%` }}
          />
        </div>

        {!isDone && !isFailed && (
          <p className="mt-3 text-xs text-muted">{tip}</p>
        )}

        {progress && progress.failed > 0 && (
          <p className="mt-2 text-xs text-amber-300">
            {progress.failed} message{progress.failed === 1 ? "" : "s"} could not
            be read and were skipped.
          </p>
        )}

        {isFailed && (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
              {error ?? progress?.error ?? "Something went wrong."}
            </p>
            <Button size="sm" onClick={() => start(true)}>
              Retry
            </Button>
          </div>
        )}

        {isDone && (
          <div className="mt-5">
            <BandBars histogram={progress!.bandHistogram} total={progress!.total} />
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => router.push("/dashboard")}>
                View dashboard
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => start(true)}
                disabled={running}
              >
                Re-scan
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BandBars({
  histogram,
  total,
}: {
  histogram: Record<string, number>;
  total: number;
}) {
  return (
    <div className="space-y-1.5">
      {BAND_ORDER.map((band) => {
        const c = histogram[band] ?? 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        const meta = BAND_META[band as RiskBand];
        return (
          <div key={band} className="flex items-center gap-3 text-xs">
            <span className="w-16 text-muted">{meta.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className={`block h-full ${meta.dot}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-8 text-right tabular-nums text-muted">{c}</span>
          </div>
        );
      })}
    </div>
  );
}
