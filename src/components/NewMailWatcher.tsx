"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";
import type { RiskBand } from "@prisma/client";

type NewMail = {
  total: number;
  flagged: number;
  top: {
    id: string;
    subject: string;
    senderDomain: string;
    priorityScore: number | null;
    analysis: { band: RiskBand; score: number } | null;
  } | null;
};

/**
 * Gmail is polled, not pushed — a real-time feed needs a Pub/Sub `watch`
 * renewed weekly plus a verified domain, which this deployment cannot
 * register. A minute is cheap: the poll lists message ids and only fetches
 * bodies for ids that are not already stored, so an idle mailbox costs one
 * `messages.list` call.
 */
const POLL_MS = 60_000;

function timeAgo(at: number | null): string {
  if (!at) return "never";
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

/**
 * Keeps the dashboard current: pulls mail that has arrived since the last
 * pass, runs it through the same pipeline, and raises a banner. Rendered on
 * the dashboard only, so polling stops when the user navigates away.
 */
export function NewMailWatcher() {
  const router = useRouter();
  const [news, setNews] = useState<NewMail | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning">("idle");
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  /** Run a scan pass, then refresh the unseen-mail counts. */
  const scan = useCallback(
    async (full = false) => {
      // A pass can outlive the interval; overlapping runs would double-fetch.
      if (busy.current) return;
      busy.current = true;
      setStatus("scanning");
      setError(null);
      try {
        const started = await fetch("/api/scan/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full }),
        });
        if (!started.ok) {
          const e = (await started.json().catch(() => ({}))) as { error?: string };
          setError(
            e.error === "ReauthRequired"
              ? "Google session expired — sign in again."
              : (e.error ?? "Could not start scan"),
          );
          return;
        }

        // Drain the queue this pass created so new mail is fully scored —
        // signals, geolocation, priority — before the banner announces it.
        let progress = (await started.json()) as { jobId: string; done: boolean };
        while (!progress.done) {
          const res = await fetch("/api/scan/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: progress.jobId }),
          });
          if (!res.ok) break;
          const p = (await res.json()) as { jobId: string; done: boolean };
          progress = { jobId: progress.jobId, done: p.done };
        }

        const res = await fetch("/api/mail/new");
        if (res.ok) {
          const data = (await res.json()) as NewMail;
          if (data.total > 0) setNews(data);
        }
        router.refresh();
      } catch {
        setError("Lost connection — will retry on the next pass.");
      } finally {
        busy.current = false;
        setLastRun(Date.now());
        setStatus("idle");
      }
    },
    [router],
  );

  useEffect(() => {
    // Scan immediately on mount, then on an interval. Waiting a full period
    // before the first pass made the watcher look broken on a fresh dashboard.
    // Deferred by a tick so the first setState lands after the effect body
    // rather than cascading a render inside it.
    const kick = setTimeout(() => void scan(false), 0);
    const t = setInterval(() => void scan(false), POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [scan]);

  const dismiss = useCallback(async () => {
    setNews(null);
    await fetch("/api/mail/new", { method: "POST" }).catch(() => {});
    router.refresh();
  }, [router]);

  const scanning = status === "scanning";

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span
            className={
              scanning
                ? "size-1.5 animate-pulse rounded-full bg-brand"
                : "size-1.5 rounded-full bg-safe"
            }
          />
          <span className="text-muted">
            {scanning ? (
              "Checking Gmail for new mail…"
            ) : error ? (
              <span className="text-high">{error}</span>
            ) : (
              <>
                Auto-checking every minute · last checked{" "}
                <span className="text-foreground">{timeAgo(lastRun)}</span>
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void scan(false)}
            disabled={scanning}
          >
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void scan(true)}
            disabled={scanning}
            title="Re-fetch and re-score every message in the scan window, not just new arrivals"
          >
            Full rescan
          </Button>
        </div>
      </div>

      {news && (
        <div className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {news.total} new {news.total === 1 ? "email" : "emails"} analyzed
                {news.flagged > 0 && (
                  <span className="text-high"> · {news.flagged} flagged</span>
                )}
              </p>
              {news.top && (
                <Link
                  href={`/mail/${news.top.id}`}
                  className="mt-1 flex items-center gap-2 text-xs text-muted hover:text-foreground"
                >
                  <span className="min-w-0 truncate">
                    Top priority: {news.top.subject || "(no subject)"}
                    <span className="ml-1 text-muted/70">{news.top.senderDomain}</span>
                  </span>
                  {news.top.analysis && (
                    <RiskBadge
                      band={news.top.analysis.band}
                      score={news.top.analysis.score}
                    />
                  )}
                </Link>
              )}
            </div>
            <button
              onClick={() => void dismiss()}
              className="shrink-0 text-xs text-muted hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
