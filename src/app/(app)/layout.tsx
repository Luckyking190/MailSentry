import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { signOutAction } from "@/server/actions/auth";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const needsReconsent = session.error === "RefreshFailed";

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <div className="px-2 pb-4">
          <Logo />
        </div>
        <NavLinks />
        <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-xs font-medium text-brand">
            {initials(session.user.name ?? session.user.email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">
              {session.user.name ?? "Signed in"}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {session.user.email}
            </span>
          </span>
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" type="submit" className="px-2">
              Exit
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {needsReconsent && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
            Google session expired.{" "}
            <form action={signOutAction} className="inline">
              <button type="submit" className="underline">
                Sign in again
              </button>
            </form>{" "}
            to keep scanning.
          </div>
        )}
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
