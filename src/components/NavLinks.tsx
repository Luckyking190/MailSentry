"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

const LINKS = [
  { href: "/dashboard", label: "Overview & Summary", icon: "dashboard" },
  { href: "/mail", label: "Domain Forensics", icon: "security" },
  { href: "/scan", label: "Telemetry & ML", icon: "model_training" },
  { href: "/settings", label: "Settings", icon: "tune" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mt-space-sm flex flex-col gap-space-xs px-space-md">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-space-md rounded-lg px-space-md py-space-sm transition-all t-mono-md",
              active
                ? "glow-active bg-primary-container font-bold text-on-primary-container"
                : "text-on-surface-variant hover:bg-surface-high hover:text-on-surface",
            )}
          >
            <Icon name={l.icon} className="shrink-0 text-[20px]" />
            <span className="truncate whitespace-nowrap">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
