"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteDataButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await fetch("/api/account/delete-data", { method: "POST" });
      router.push("/scan");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
        Delete my scanned data
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">
        Permanently deletes every scanned email, analysis, and scan job for
        your account. This cannot be undone.
      </span>
      <Button size="sm" variant="danger" onClick={run} disabled={busy}>
        {busy ? "Deleting…" : "Confirm delete"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
