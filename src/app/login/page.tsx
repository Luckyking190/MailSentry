import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { APP_NAME } from "@/components/Logo";
import { GoogleButton } from "@/components/GoogleButton";
import { ShieldMark } from "@/components/ShieldMark";
import { Icon } from "@/components/Icon";
import { signInForDemo } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-surface p-space-lg">
      <div className="relative mx-auto flex w-full max-w-3xl select-none flex-col items-center justify-center px-space-base py-space-xl">
        {/* Ambient cyan wash — the design's "localized glow field". */}
        <div className="pointer-events-none absolute left-1/2 top-1/4 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-container/10 blur-[130px]" />

        <div className="relative z-10 mb-space-lg flex flex-col items-center text-center">
          <div className="group relative mb-space-md flex items-center justify-center">
            <div className="absolute -inset-2 rounded-full bg-primary-container/20 blur-xl transition-all duration-700 group-hover:bg-primary-container/35" />
            <div className="relative flex size-24 items-center justify-center rounded-2xl bg-surface-lowest shadow-xl">
              <ShieldMark />
            </div>
          </div>

          <div className="mb-space-xs inline-flex items-center gap-space-xs rounded bg-primary-container/10 px-space-sm py-0.5">
            <span className="t-mono-sm font-semibold tracking-widest text-primary-container">
              AUTONOMOUS SEC-OPS AGENT
            </span>
          </div>
          <h1 className="t-headline-lg font-bold tracking-tight text-primary">
            {APP_NAME}
          </h1>
          <p className="t-body-md mt-space-xs max-w-xl text-center leading-relaxed text-on-surface-variant">
            AI-powered mailbox forensics and automated domain threat detection.
          </p>
        </div>

        <div className="relative w-full max-w-xl overflow-hidden rounded-xl bg-surface-low/90 p-space-xl shadow-2xl backdrop-blur-xl">
          <div className="-mx-space-xl -mt-space-xl mb-space-lg flex items-center justify-between bg-surface-lowest/60 px-space-xl py-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="size-2.5 rounded-full bg-error" />
              <span className="size-2.5 rounded-full bg-secondary-container" />
              <span className="size-2.5 rounded-full bg-primary-container" />
              <span className="ml-space-xs t-mono-sm text-on-surface-variant">
                GATEWAY://AUTH_OAUTH2_GMAIL
              </span>
            </div>
            <div className="flex items-center gap-1 t-mono-sm text-secondary">
              <Icon name="verified_user" className="text-[14px]" />
              <span>ZERO TRUST NODE</span>
            </div>
          </div>

          <div className="flex flex-col gap-space-md">
            <GoogleButton />

            <p className="t-mono-sm text-center leading-relaxed text-on-surface-variant">
              Read-only access (<span className="text-primary">gmail.readonly</span>).
              Mail is scored, then wiped from our store when you sign out.
            </p>

            <div className="flex items-center gap-3 t-mono-sm text-on-surface-variant/60">
              <span className="h-px flex-1 bg-outline-variant" />
              or
              <span className="h-px flex-1 bg-outline-variant" />
            </div>

            <GoogleButton
              label="Load the curated demo mailbox"
              action={signInForDemo}
              variant="secondary"
            />
          </div>

          {error && (
            <p className="mt-space-md rounded bg-error-container/30 px-space-sm py-space-xs t-mono-sm text-error">
              Sign-in failed ({String(error)}). If this is an{" "}
              <em>unverified app</em> screen, ask the project owner to add your
              email as a test user.
            </p>
          )}

          <div className="mt-space-lg flex items-center justify-center gap-space-lg pt-space-md text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Icon name="lock" className="text-[14px] text-primary-container" />
              <span className="t-mono-sm">READ-ONLY SCOPE</span>
            </span>
            <span className="opacity-30">•</span>
            <span className="flex items-center gap-1">
              <Icon name="delete_sweep" className="text-[14px] text-secondary" />
              <span className="t-mono-sm">WIPED ON SIGN-OUT</span>
            </span>
          </div>
        </div>

        <div className="mt-space-xl flex w-full max-w-3xl flex-col items-center justify-between gap-space-xs px-space-xs py-space-md t-mono-sm text-on-surface-variant md:flex-row">
          <div className="flex items-center gap-space-md">
            <span>SIH26106</span>
            <span className="opacity-30">|</span>
            <span>Smart India Hackathon</span>
          </div>
          <div className="flex items-center gap-space-md">
            <span>Phishing</span>
            <span className="opacity-30">•</span>
            <span>Spoofing</span>
            <span className="opacity-30">•</span>
            <span>BEC</span>
            <span className="opacity-30">•</span>
            <span>Geolocation</span>
          </div>
        </div>
      </div>
    </main>
  );
}
