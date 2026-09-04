import { auth } from "@/server/auth";
import { startScan, toProgress } from "@/server/scan/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.error === "RefreshFailed") {
    return Response.json({ error: "ReauthRequired" }, { status: 401 });
  }

  try {
    const job = await startScan(session.user.id);
    return Response.json(toProgress(job));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start scan" },
      { status: 500 },
    );
  }
}
