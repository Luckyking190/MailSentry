"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { BAND_META, BAND_ORDER } from "@/lib/scoring";
import { cn } from "@/lib/utils";
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

/**
 * The design's four-stage convergence checklist. Each stage maps to a real
 * phase of the pipeline rather than a decorative step: ingest, score, resolve
 * domain intel, finish.
 */
const STAGES = [
  {
    key: "ingest",
    title: "Ingesting Gmail API message threads",
    detail: "Raw MIME payloads fetched over OAuth2 and parsed.",
  },
  {
    key: "analyze",
    title: "Scoring content, senders and attachments",
    detail:
      "Urgency heuristics, impersonation, lookalike domains, URL and attachment analysis.",
  },
  {
    key: "intel",
    title: "Validating SPF/DKIM/DMARC, domain age and geolocation",
    detail: "DNS and RDAP lookups, originating-hop geolocation per message.",
  },
  {
    key: "done",
    title: "Risk banding and priority index",
    detail: "Weighted aggregation into a 0-100 score, then the read-affinity index.",
  },
] as const;

const CIRCUMFERENCE = 2 * Math.PI * 42;

export function ScanRunner({
  initial,
  mode = "gmail",
  compact = false,
}: {
  initial: Progress | null;
  mode?: "gmail" | "demo";
  compact?: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<
    { at: string; level: "PASS" | "WARN" | "ALERT" | "INFO"; text: string }[]
  >([]);
  const loopingRef = useRef(false);

  const pushLog = useCallback(
    (level: "PASS" | "WARN" | "ALERT" | "INFO", text: string) => {
      const at = new Date().toTimeString().slice(0, 8);
      // Keep the stream bounded; this is a live tail, not a transcript.
      setLog((l) => [...l.slice(-40), { at, level, text }]);
    },
    [],
  );

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
            pushLog("ALERT", data.error ?? "Scan failed");
            break;
          }
          setProgress((prev) => {
            // Report only what actually changed this tick.
            if (prev && data.processed > prev.processed) {
              const n = data.processed - prev.processed;
              pushLog("INFO", `Scored ${n} message${n === 1 ? "" : "s"} · ${data.processed}/${data.total}`);
            }
            return data;
          });
          if (compact) router.refresh();
          if (data.done) {
            if (data.phase === "DONE") {
              pushLog("PASS", `Scan complete — ${data.processed} messages analyzed`);
              if (compact) router.refresh();
              else setTimeout(() => router.push("/dashboard"), 1400);
            }
            break;
          }
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
    [router, compact, pushLog],
  );

  const loadDemo = useCallback(async () => {
    setError(null);
    setRunning(true);
    pushLog("INFO", "Loading curated demo mailbox…");
    try {
      const res = await fetch("/api/demo/load", { method: "POST" });
      const data = (await res.json()) as Progress & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load the demo mailbox");
        return;
      }
      setProgress(data);
      pushLog("PASS", `Demo mailbox loaded — ${data.total} messages`);
      setTimeout(() => router.push("/dashboard"), 1400);
    } catch {
      setError("Lost connection while loading the demo mailbox.");
    } finally {
      setRunning(false);
    }
  }, [router, pushLog]);

  const start = useCallback(
    async (full = false) => {
      if (mode === "demo") return loadDemo();
      setError(null);
      const res = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
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
      pushLog("INFO", full ? "Full re-scan queued" : `Queued ${data.total} new message(s)`);
      if (!data.done || full) void runLoop(data.jobId);
    },
    [runLoop, mode, loadDemo, pushLog],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if (mode === "demo") void loadDemo();
      else if (!initial) void start();
      else if (!initial.done) void runLoop(initial.jobId);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : progress?.done
        ? 100
        : 0;

  const isDone = progress?.done && progress.phase === "DONE";
  const isFailed = progress?.phase === "FAILED" || !!error;

  // Which checklist stage is live, derived from real progress.
  const stageIndex = isDone ? 3 : pct > 0 ? 1 : 0;

  if (compact) {
    if (isDone || (!progress && !error)) return null;
    return (
      <div className="mb-space-md rounded-xl bg-surface-low px-space-md py-space-sm elev-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="t-mono-sm text-on-surface-variant">
            {isFailed
              ? (error ?? "Scan failed — results below are partial.")
              : "Scoring messages… results appear here as they land."}
          </p>
          <p className="shrink-0 t-mono-sm tnum text-on-surface-variant">
            {progress ? `${progress.processed}/${progress.total || "…"}` : "…"}
          </p>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-highest">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isFailed ? "bg-error" : "bg-primary-container",
            )}
            style={{ width: `${isFailed ? 100 : pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Banner ---------------------------------------------------------- */}
      <div className="relative flex flex-col justify-between gap-space-md overflow-hidden rounded-xl bg-surface-low p-space-lg elev-2 lg:flex-row lg:items-center">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary-container/10 blur-3xl" />
        <div className="flex min-w-0 items-center gap-space-md">
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-high">
            <Icon
              name="memory"
              className={cn("text-[22px] text-primary-container", running && "animate-pulse")}
            />
            <span className="absolute -bottom-1 -right-1 flex size-3">
              {running && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-secondary opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-3 rounded-full",
                  isFailed ? "bg-error" : isDone ? "bg-secondary" : "bg-primary-container",
                )}
              />
            </span>
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className="t-label-sm font-bold tracking-widest text-primary">
                {mode === "demo" ? "TASK: DEMO-INGEST" : "TASK: MAILBOX-INGEST"}
              </span>
              <span className="inline-block size-1 rounded-full bg-outline" />
              <span className="t-mono-sm font-semibold text-secondary">
                {isFailed ? "NODE ERROR" : isDone ? "IDLE" : "NODE ACTIVE"}
              </span>
            </div>
            <h2 className="t-headline-sm truncate font-bold tracking-tight text-primary">
              {isFailed
                ? "Scan failed"
                : isDone
                  ? "Analysis complete"
                  : (PHASE_COPY[progress?.phase ?? "QUEUED"] ?? "Scanning…")}
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-space-sm self-end lg:self-auto">
          <button
            onClick={() => void start(true)}
            disabled={running}
            className="flex items-center gap-space-xs rounded-lg bg-surface-container px-space-md py-space-sm t-mono-md text-on-surface transition-all hover:bg-surface-high disabled:opacity-50"
          >
            <Icon name="refresh" className="text-[16px]" />
            <span>Full re-scan</span>
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-space-xs rounded-lg bg-primary-container px-space-md py-space-sm t-mono-md font-bold text-on-primary-container shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all hover:opacity-90"
          >
            <span>Dashboard</span>
            <Icon name="arrow_forward" className="text-[16px]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-space-lg xl:grid-cols-12">
        {/* Radial gauge -------------------------------------------------- */}
        <div className="flex flex-col justify-between rounded-xl bg-surface-low p-space-xl elev-2 xl:col-span-5">
          <div className="flex items-center justify-between">
            <span className="t-label-md text-on-surface-variant">Telemetry Engine</span>
            <span className="rounded bg-surface-container px-space-sm py-space-2xs t-mono-sm font-semibold text-secondary">
              {progress ? `${progress.processed} / ${progress.total || "…"}` : "IDLE"}
            </span>
          </div>

          <div className="relative my-space-lg flex flex-col items-center justify-center">
            <div className="relative flex size-64 items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="text-surface-high"
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="6"
                />
                <circle
                  className={cn(
                    "opacity-30 blur-[2px]",
                    isFailed ? "text-error" : "text-primary-container",
                  )}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke="currentColor"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE}
                  strokeLinecap="round"
                  strokeWidth="6"
                />
                <circle
                  className={cn(
                    "transition-all duration-700 ease-out",
                    isFailed ? "text-error" : "text-primary-container",
                  )}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke="currentColor"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE}
                  strokeLinecap="round"
                  strokeWidth="6.5"
                />
                {running && (
                  <circle
                    className="animate-[spin_18s_linear_infinite] text-secondary/40"
                    cx="50"
                    cy="50"
                    r="34"
                    fill="transparent"
                    stroke="currentColor"
                    strokeDasharray="8 6"
                    strokeWidth="2"
                    style={{ transformOrigin: "50% 50%" }}
                  />
                )}
                <circle
                  className="text-outline-variant/50"
                  cx="50"
                  cy="50"
                  r="28"
                  fill="transparent"
                  stroke="currentColor"
                  strokeDasharray="4 8"
                  strokeWidth="1.5"
                />
              </svg>

              <div className="absolute inset-0 flex select-none flex-col items-center justify-center text-center">
                <span className="t-label-sm text-on-surface-variant">Aggregate Sync</span>
                <div className="flex items-baseline">
                  <span className="text-[40px] font-bold leading-none tracking-tighter text-primary tnum">
                    {pct}
                  </span>
                  <span className="t-headline-sm font-semibold text-primary-container">%</span>
                </div>
                <span className="mt-space-2xs flex items-center gap-1 t-mono-sm text-secondary">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      running ? "animate-pulse bg-secondary" : "bg-outline",
                    )}
                  />
                  {running ? "streaming" : isDone ? "complete" : "idle"}
                </span>
              </div>
            </div>

            <div className="mt-space-md text-center">
              <p className="t-headline-sm font-semibold text-on-surface">
                {progress
                  ? `Scanned ${progress.processed} / ${progress.total || "…"} emails`
                  : "Preparing…"}
              </p>
              {progress && progress.failed > 0 && (
                <p className="mt-space-2xs t-mono-sm text-medium">
                  {progress.failed} message{progress.failed === 1 ? "" : "s"} could
                  not be read and were skipped.
                </p>
              )}
            </div>
          </div>

          {isDone && progress && (
            <div className="rounded-lg bg-surface-container/60 p-space-sm">
              <BandBars histogram={progress.bandHistogram} total={progress.total} />
            </div>
          )}
        </div>

        {/* Checklist + stream -------------------------------------------- */}
        <div className="flex flex-col justify-between gap-space-md xl:col-span-7">
          <div className="flex flex-1 flex-col gap-space-md rounded-xl bg-surface-low p-space-lg elev-2">
            <div className="flex items-center justify-between pb-space-xs">
              <span className="t-headline-sm font-semibold text-on-surface">
                Model Convergence Checklist
              </span>
              <span className="t-mono-sm text-on-surface-variant">
                STAGE {Math.min(stageIndex + 1, 4)} OF 4
              </span>
            </div>

            {STAGES.map((s, i) => {
              const done = i < stageIndex || isDone;
              const active = i === stageIndex && !isDone;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex items-start gap-space-md rounded-lg bg-surface-container p-space-md transition-all",
                    active && "shadow-[0_0_12px_rgba(0,240,255,0.08)]",
                    !done && !active && "opacity-60",
                  )}
                >
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
                    {done ? (
                      <span className="flex size-6 items-center justify-center rounded-full bg-secondary-container/20">
                        <Icon name="check" className="text-[14px] text-secondary" />
                      </span>
                    ) : active ? (
                      <span className="relative flex size-6 items-center justify-center">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-container opacity-40" />
                        <span className="relative flex size-5 items-center justify-center rounded-full bg-primary-container/20">
                          <Icon name="sync" className="animate-spin text-[12px] text-primary-container" />
                        </span>
                      </span>
                    ) : (
                      <span className="flex size-6 items-center justify-center rounded-full bg-surface-high">
                        <Icon name="hourglass_empty" className="text-[12px] text-outline" />
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "t-body-md truncate font-semibold",
                          active ? "text-primary" : "text-on-surface",
                        )}
                      >
                        {s.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-space-xs py-space-2xs t-mono-sm font-bold",
                          done
                            ? "bg-surface-highest text-secondary"
                            : active
                              ? "bg-primary/10 text-primary-container"
                              : "bg-surface-high text-on-surface-variant",
                        )}
                      >
                        {done ? "COMPLETE" : active ? `ACTIVE · ${pct}%` : "PENDING"}
                      </span>
                    </div>
                    <p className="mt-space-2xs t-mono-sm text-on-surface-variant">
                      {s.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live stream ------------------------------------------------------ */}
      <div className="relative flex flex-col gap-space-md overflow-hidden rounded-xl bg-surface-lowest p-space-lg elev-2">
        <div className="flex flex-col justify-between gap-space-sm border-b border-surface-high pb-space-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-space-sm">
            <div className="flex items-center gap-space-2xs">
              <span className="inline-block size-3 rounded-full bg-error" />
              <span className="inline-block size-3 rounded-full bg-surface-highest" />
              <span className="inline-block size-3 rounded-full bg-secondary" />
            </div>
            <span className="pl-space-xs t-mono-md font-bold text-primary">
              SEC_FORENSIC_STREAM://scan.live
            </span>
          </div>
          <div className="flex items-center gap-space-xs rounded bg-surface-high px-space-sm py-space-2xs">
            <span
              className={cn(
                "size-2 rounded-full",
                running ? "animate-pulse bg-secondary" : "bg-outline",
              )}
            />
            <span className="t-mono-sm text-on-surface">
              {running ? "streaming" : "idle"}
            </span>
          </div>
        </div>

        <div className="flex h-56 select-text flex-col gap-space-xs overflow-y-auto pr-space-sm t-mono-sm">
          {log.length === 0 ? (
            <p className="py-space-lg text-center text-on-surface-variant">
              Waiting for the first batch…
            </p>
          ) : (
            log.map((l, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-space-sm rounded px-space-xs py-space-2xs",
                  l.level === "ALERT" && "bg-error-container/20",
                  l.level === "WARN" && "bg-error-container/10",
                )}
              >
                <span className="select-none text-on-surface-variant">[{l.at}]</span>
                <span
                  className={cn(
                    "select-none rounded px-space-xs font-bold",
                    l.level === "ALERT"
                      ? "bg-error text-on-error"
                      : l.level === "WARN"
                        ? "bg-error/20 text-error"
                        : l.level === "PASS"
                          ? "bg-secondary/10 text-secondary"
                          : "bg-primary-container/20 text-primary-container",
                  )}
                >
                  [{l.level}]
                </span>
                <span className="flex-1 text-on-surface">{l.text}</span>
              </div>
            ))
          )}
        </div>

        {isFailed && (
          <div className="flex items-center justify-between gap-space-sm rounded bg-error-container/20 px-space-sm py-space-xs">
            <span className="t-mono-sm text-error">
              {error ?? progress?.error ?? "Something went wrong."}
            </span>
            <button
              onClick={() => void start()}
              className="rounded bg-surface-highest px-space-md py-1 t-mono-sm font-semibold text-on-surface hover:bg-surface-bright"
            >
              Retry
            </button>
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
          <div key={band} className="flex items-center gap-3 t-mono-sm">
            <span className="w-16 text-on-surface-variant">{meta.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-highest">
              <span className={`block h-full ${meta.dot}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-8 text-right tnum text-on-surface-variant">{c}</span>
          </div>
        );
      })}
    </div>
  );
}
