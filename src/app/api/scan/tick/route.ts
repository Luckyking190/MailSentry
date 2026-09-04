import { auth } from "@/server/auth";
import { tickScan } from "@/server/scan/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobId: string | undefined;
  try {
    ({ jobId } = (await req.json()) as { jobId?: string });
  } catch {
    /* ignore */
  }
  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  try {
    const progress = await tickScan(session.user.id, jobId);
    return Response.json(progress);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Scan tick failed" },
      { status: 500 },
    );
  }
}
