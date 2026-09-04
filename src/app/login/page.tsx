import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { APP_NAME, APP_TAGLINE, Logo } from "@/components/Logo";
import { GoogleButton } from "@/components/GoogleButton";
import { signInForDemo } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="bg-grid flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-surface shadow-lg shadow-brand/10">
            <Logo withText={false} className="scale-125" />
          </span>
          <h1 className="bg-gradient-to-b from-foreground to-muted bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            {APP_NAME}
          </h1>
          <p className="mt-1.5 text-sm text-muted">{APP_TAGLINE}</p>
        </div>

        <div className="sheen rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <p className="mb-5 text-sm text-muted">
            Connect your Google account to let {APP_NAME} read and score your
            inbox for phishing, spoofing, and Business Email Compromise. Access is{" "}
            <span className="text-foreground">read-only</span> (
            <code className="text-xs">gmail.readonly</code>).
          </p>

          <GoogleButton />

          <div className="my-4 flex items-center gap-3 text-[11px] text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleButton
            label="Try the demo mailbox"
            action={signInForDemo}
            variant="secondary"
          />
          <p className="mt-2 text-center text-xs text-muted">
            Still signs in with Google (read-only), but loads a curated set of
            sample phishing / spoofing / BEC emails instead of your real inbox.
          </p>

          {error && (
            <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
              Sign-in failed ({String(error)}). If this is an{" "}
              <em>unverified app</em> screen, ask the project owner to add your
              email as a test user.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 text-[11px] text-muted/70">
            <span>Phishing</span>
            <span className="size-1 rounded-full bg-border-strong" />
            <span>Spoofing</span>
            <span className="size-1 rounded-full bg-border-strong" />
            <span>BEC</span>
            <span className="size-1 rounded-full bg-border-strong" />
            <span>Geolocation</span>
          </div>
          <p className="text-center text-xs text-muted/60">
            SIH26106 · Built for the Smart India Hackathon
          </p>
        </div>
      </div>
    </main>
  );
}
