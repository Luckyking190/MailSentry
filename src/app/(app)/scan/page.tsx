import type { Metadata } from "next";

import { auth } from "@/server/auth";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";
import { PageHeader } from "@/components/PageHeader";
import { ScanRunner } from "@/components/ScanRunner";

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await auth();
  const job = await getActiveOrLatestJob(session!.user.id);
  const initial = job ? toProgress(job) : null;

  return (
    <>
      <PageHeader
        title="Scanning your mailbox"
        description='Fetching messages, resolving senders, and scoring each email — the "training" pass.'
      />
      <ScanRunner initial={initial} />
    </>
  );
}
