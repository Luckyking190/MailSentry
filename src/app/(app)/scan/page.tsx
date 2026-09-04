import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { PageHeader } from "@/components/PageHeader";
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

  return (
    <>
      <PageHeader
        title={mode === "demo" ? "Loading the demo mailbox" : "Scanning your mailbox"}
        description={
          mode === "demo"
            ? "Parsing and scoring a curated set of sample phishing, spoofing, and BEC emails."
            : 'Fetching messages, resolving senders, and scoring each email — the "training" pass.'
        }
      />
      <ScanRunner initial={initial} mode={mode} />
    </>
  );
}
