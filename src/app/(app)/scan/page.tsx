import type { Metadata } from "next";

import { PageHeader, Placeholder } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <>
      <PageHeader
        title="Scanning your mailbox"
        description='Fetching messages, resolving sender domains, and scoring each email — the "training" pass.'
      />
      <Placeholder phase="Phase 2">
        The loading screen with live progress (list → fetch → analyze → domain
        intel) will render here, driven by the batched scan job.
      </Placeholder>
    </>
  );
}
