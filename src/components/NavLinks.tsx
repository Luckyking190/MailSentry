"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Inline 16px glyphs — a handful of paths is cheaper than an icon package. */
const ICONS = {
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  mail: "M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13Zm1.8.5 7.2 5.4L19.2 6H4.8Z",
  scan: "M4 4h5V2H2v7h2V4Zm11-2v2h5v5h2V2h-7ZM4 15H2v7h7v-2H4v-5Zm16 5h-5v2h7v-7h-2v5ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  settings:
    "M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Zm8.9-2.6.2-1.9-2.1-.4a7 7 0 0 0-.7-1.7l1.2-1.7-1.4-1.4-1.7 1.2a7 7 0 0 0-1.7-.7l-.4-2.1h-2l-.4 2.1a7 7 0 0 0-1.7.7L8.5 5.8 7.1 7.2l1.2 1.7a7 7 0 0 0-.7 1.7l-2.1.4v2l2.1.4c.2.6.4 1.2.7 1.7l-1.2 1.7 1.4 1.4 1.7-1.2c.5.3 1.1.5 1.7.7l.4 2.1h2l.4-2.1c.6-.2 1.2-.4 1.7-.7l1.7 1.2 1.4-1.4-1.2-1.7c.3-.5.5-1.1.7-1.7l2.1-.4Z",
} as const;

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
  { href: "/mail", label: "Mail", icon: ICONS.mail },
  { href: "/scan", label: "Scan", icon: ICONS.scan },
  { href: "/settings", label: "Settings", icon: ICONS.settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-surface-2 font-medium text-foreground"
                : "text-muted hover:bg-surface-2/60 hover:text-foreground",
            )}
          >
            {/* Active rail — the one unambiguous "you are here" cue. */}
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <svg
              viewBox="0 0 24 24"
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-brand-soft" : "text-muted group-hover:text-foreground",
              )}
              fill="currentColor"
              aria-hidden
            >
              <path d={l.icon} />
            </svg>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
