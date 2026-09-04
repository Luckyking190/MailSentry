import { auth } from "@/server/auth";
import { loadDemoMailbox } from "@/server/demo/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await loadDemoMailbox(session.user.id);
    return Response.json({
      ...result,
      phase: "DONE" as const,
      done: true,
      error: null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load demo mailbox" },
      { status: 500 },
    );
  }
}
