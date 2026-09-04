"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReanalyzeButton({
  scope,
  emailId,
  label,
}: {
  scope: "all" | "one";
  emailId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const url = scope === "all" ? "/api/scan/reanalyze" : `/api/emails/${emailId}/reanalyze`;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Re-analysis failed");
      } else {
        setResult(
          scope === "all"
            ? `Re-scored ${data.processed} email${data.processed === 1 ? "" : "s"}${data.failed ? ` (${data.failed} failed)` : ""}.`
            : "Re-scored.",
        );
        router.refresh();
      }
    } catch {
      setResult("Lost connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
        {busy ? "Re-analyzing…" : (label ?? "Re-run analysis")}
      </Button>
      {result && <span className="text-xs text-muted">{result}</span>}
    </div>
  );
}
