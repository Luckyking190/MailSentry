"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

/** Gmail is polled, not pushed: a real-time feed needs a Pub/Sub `watch`
 *  renewed every 7 days plus a verified domain, which this deployment has no
 *  way to register. Five minutes is a compromise between freshness and burning
 *  Gmail quota on a mailbox that mostly is not changing. */
const POLL_MS = 5 * 60_000;

/**
 * Keeps the dashboard current: periodically asks Gmail for mail that arrived
 * since the last pass, runs it through the same pipeline, and raises a banner.
 * Rendered on the dashboard only, so polling stops when the user navigates
 * away rather than running for the life of the session.
 */
export function NewMailWatcher() {
  const router = useRouter();
  const [news, setNews] = useState<NewMail | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async () => {
    // A scan tick can outlive the interval; overlapping runs would double-fetch.
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const started = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: false }),
      });
      if (started.ok) {
        const job = (await started.json()) as { jobId: string; done: boolean };
        // Drain the queue this pass created, so new mail is fully scored
        // (geo, signals, priority) before the banner claims it arrived.
        while (!job.done) {
          const res = await fetch("/api/scan/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: job.jobId }),
          });
          if (!res.ok) break;
          const p = (await res.json()) as { done: boolean };
          if (p.done) break;
        }
      }

      const res = await fetch("/api/mail/new");
      if (res.ok) {
        const data = (await res.json()) as NewMail;
        if (data.total > 0) {
          setNews(data);
          router.refresh();
        }
      }
    } catch {
      // Offline or a failed tick — the next interval tries again.
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    // Show anything that landed while the user was away before polling again.
    void (async () => {
      try {
        const res = await fetch("/api/mail/new");
        if (!res.ok) return;
        const data = (await res.json()) as NewMail;
        if (data.total > 0) setNews(data);
      } catch {
        /* first paint should never depend on this */
      }
    })();

    const t = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(t);
  }, [check]);

  const dismiss = useCallback(async () => {
    setNews(null);
    await fetch("/api/mail/new", { method: "POST" }).catch(() => {});
    router.refresh();
  }, [router]);

  if (!news) {
    return (
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={() => void check()}
          disabled={checking}
          className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {checking ? "Checking for new mail…" : "Check for new mail"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {news.total} new {news.total === 1 ? "email" : "emails"} analyzed
            {news.flagged > 0 && (
              <span className="text-orange-300"> · {news.flagged} flagged</span>
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
  );
}
