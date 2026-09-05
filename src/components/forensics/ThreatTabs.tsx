"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * Threats / clean split. Both lists are rendered server-side and toggled here,
 * so switching tabs never re-queries.
 */
export function ThreatTabs({
  threatCount,
  cleanCount,
  threats,
  clean,
}: {
  threatCount: number;
  cleanCount: number;
  threats: React.ReactNode;
  clean: React.ReactNode;
}) {
  const [tab, setTab] = useState<"threats" | "clean">("threats");

  const btn = (active: boolean) =>
    cn(
      "flex items-center gap-space-xs rounded-lg px-space-md py-space-xs t-mono-md transition-all",
      active
        ? "bg-surface-container font-semibold text-primary shadow-sm"
        : "text-on-surface-variant hover:bg-surface-high hover:text-on-surface",
    );

  return (
    <>
      <div className="flex items-center gap-1 rounded-xl bg-surface-low p-1">
        <button
          onClick={() => setTab("threats")}
          aria-pressed={tab === "threats"}
          className={btn(tab === "threats")}
        >
          <Icon name="gpp_bad" className="text-[14px] text-error" />
          <span>Threats Vault</span>
          <span className="ml-1 rounded bg-error/20 px-1.5 py-0.5 text-[10px] text-error t-mono-sm">
            {threatCount} FLAGGED
          </span>
        </button>
        <button
          onClick={() => setTab("clean")}
          aria-pressed={tab === "clean"}
          className={btn(tab === "clean")}
        >
          <Icon name="mark_email_read" className="text-[14px] text-secondary" />
          <span className="hidden sm:inline">Threat-Free &amp; Promotional</span>
          <span className="sm:hidden">Clean</span>
          <span className="ml-1 rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] text-secondary t-mono-sm">
            {cleanCount} CLEAN
          </span>
        </button>
      </div>

      <div className="mt-space-lg">{tab === "threats" ? threats : clean}</div>
    </>
  );
}
