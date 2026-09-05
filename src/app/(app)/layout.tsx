import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { signOutAction } from "@/server/actions/auth";
import { APP_NAME, Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { Icon } from "@/components/Icon";
import { initials } from "@/lib/utils";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const needsReconsent = session.error === "RefreshFailed";

  // The header strip reports real counts — the design's placeholders
  // ("SCANNED: 1,428") would otherwise be decoration that reads as data.
  const [scanned, flagged, critical] = await Promise.all([
    prisma.emailRecord.count({ where: { userId } }),
    prisma.emailRecord.count({
      where: {
        userId,
        analysis: { is: { band: { in: ["MEDIUM", "HIGH", "CRITICAL"] } } },
      },
    }),
    prisma.emailRecord.count({
      where: { userId, analysis: { is: { band: "CRITICAL" } } },
    }),
  ]);

  const threatLevel =
    critical > 0 ? "ELEVATED" : flagged > 0 ? "GUARDED" : "NOMINAL";
  const threatTone =
    critical > 0
      ? "text-error"
      : flagged > 0
        ? "text-medium"
        : "text-secondary";

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-60 flex-col justify-between bg-surface-lowest md:flex">
        <div className="flex flex-col">
          <div className="flex h-16 items-center gap-space-sm bg-surface-low px-space-lg">
            <Logo withText={false} />
            <div className="flex min-w-0 flex-col">
              <span className="t-headline-sm truncate font-bold tracking-tight text-primary">
                {APP_NAME}
              </span>
              <span className="t-label-sm text-secondary">AI Engine v3.4</span>
            </div>
          </div>

          <div className="px-space-md py-space-sm">
            <div className="flex items-center justify-between rounded-xl bg-surface-high p-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="size-2 animate-pulse rounded-full bg-secondary" />
                <span className="t-label-sm text-secondary">Agent Active</span>
              </div>
              <span className="t-mono-sm text-on-surface-variant">TLS 1.3</span>
            </div>
          </div>

          <NavLinks />
        </div>

        <div className="bg-surface-low p-space-md">
          <div className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-[11px] font-semibold text-primary-container">
              {initials(session.user.name ?? session.user.email)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="t-label-md truncate normal-case text-on-surface">
                {session.user.name ?? "Signed in"}
              </span>
              <span className="t-mono-sm truncate text-on-surface-variant">
                {session.user.email}
              </span>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out — this also wipes the scanned mailbox"
                className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-high hover:text-error"
              >
                <Icon name="logout" className="text-[18px]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-space-md border-b border-outline-variant/40 bg-surface-lowest/90 px-space-lg backdrop-blur-xl">
          <Logo withText className="md:hidden" />
          <div className="ml-auto flex items-center gap-space-md">
            <div className="hidden items-center gap-space-xs lg:flex">
              <StatChip label="Scanned" value={scanned.toLocaleString()} tone="text-primary-container" />
              <StatChip label="Threat" value={threatLevel} tone={threatTone} />
              <StatChip label="Flagged" value={String(flagged)} tone="text-secondary" />
            </div>
            <div className="flex items-center gap-space-xs rounded-lg bg-surface-high px-space-sm py-space-2xs">
              <Icon name="cloud_done" className="text-[16px] text-secondary" />
              <span className="t-label-sm text-secondary">Secure Node</span>
            </div>
          </div>
        </header>

        {needsReconsent && (
          <div className="border-b border-error/30 bg-error-container/20 px-space-lg py-space-xs t-mono-sm text-error">
            Google session expired.{" "}
            <form action={signOutAction} className="inline">
              <button type="submit" className="underline">
                Sign in again
              </button>
            </form>{" "}
            to keep scanning.
          </div>
        )}

        <main className="flex-1 px-space-lg py-space-lg">{children}</main>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-space-xs rounded-full bg-surface-container px-space-md py-space-2xs">
      <span className="t-label-sm text-on-surface-variant">{label}:</span>
      <span className={`t-mono-md font-bold ${tone}`}>{value}</span>
    </div>
  );
}
