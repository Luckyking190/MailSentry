import { auth } from "@/server/auth";
import { getActiveOrLatestJob, toProgress } from "@/server/scan/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId") ?? undefined;
  const job = await getActiveOrLatestJob(session.user.id, jobId);
  return Response.json(job ? toProgress(job) : null);
}
