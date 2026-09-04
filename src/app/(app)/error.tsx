"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p className="max-w-sm text-sm text-muted">
        {error.message || "An unexpected error occurred loading this page."}
        {error.digest && (
          <span className="mt-1 block font-mono text-[11px] text-muted/70">
            ref: {error.digest}
          </span>
        )}
      </p>
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
