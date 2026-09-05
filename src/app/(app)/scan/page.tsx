import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { ScanRunner } from "@/components/ScanRunner";

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

export default async function ScanPage(props: PageProps<"/scan">) {
  const session = await auth();
  const { mode: modeParam } = await props.searchParams;
  const mode = modeParam === "demo" ? "demo" : "gmail";

  const job =
    mode === "gmail" ? await getActiveOrLatestJob(session!.user.id) : null;
  const initial = job ? toProgress(job) : null;

  // The runner owns the whole screen now — banner, gauge, checklist, stream.
  return <ScanRunner initial={initial} mode={mode} />;
}
