import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes the user's scanned mail (emails, analysis, scan jobs) — not the
 * account itself, so they stay signed in. Cascades via Prisma relations. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const [{ count: emailsDeleted }] = await prisma.$transaction([
    prisma.emailRecord.deleteMany({ where: { userId } }),
    prisma.scanJob.deleteMany({ where: { userId } }),
  ]);

  return Response.json({ emailsDeleted });
}
