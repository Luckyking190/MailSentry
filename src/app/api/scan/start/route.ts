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

  // Default is incremental (new arrivals only). `full` re-queues the whole
  // window — the explicit "Full rescan" control.
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
