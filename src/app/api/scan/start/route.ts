import { auth } from "@/server/auth";
import { startScan, toProgress } from "@/server/scan/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.error === "RefreshFailed") {
    return Response.json({ error: "ReauthRequired" }, { status: 401 });
  }

  // `full` re-queues the whole window (the "Re-scan" button); the default is
  // an incremental pass that only picks up mail that has arrived since.
  const full = await req
    .json()
    .then((b: unknown) => !!(b as { full?: boolean })?.full)
    .catch(() => false);

  try {
    const job = await startScan(session.user.id, "gmail", full);
    return Response.json(toProgress(job));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start scan" },
      { status: 500 },
    );
  }
}
