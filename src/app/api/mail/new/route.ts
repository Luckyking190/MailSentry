import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unseen-mail badge. Counts what has been analyzed since the user last looked,
 * split out by flagged/critical so the banner can say something useful rather
 * than just "N new".
 *
 * GET  — read the counts.
 * POST — mark everything seen (the dashboard calls this once it has rendered).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { mailSeenAt: true },
  });

  const since = settings.mailSeenAt;

  const [total, flagged, top] = await Promise.all([
    prisma.emailRecord.count({ where: { userId, createdAt: { gt: since } } }),
    prisma.emailRecord.count({
      where: {
        userId,
        createdAt: { gt: since },
        analysis: { is: { band: { in: ["MEDIUM", "HIGH", "CRITICAL"] } } },
      },
    }),
    // The single most important new arrival, by the priority index.
    prisma.emailRecord.findFirst({
      where: { userId, createdAt: { gt: since } },
      orderBy: [{ priorityScore: "desc" }, { sentAt: "desc" }],
      select: {
        id: true,
        subject: true,
        senderDomain: true,
        priorityScore: true,
        analysis: { select: { band: true, score: true } },
      },
    }),
  ]);

  return Response.json({ total, flagged, top, since: since.toISOString() });
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, mailSeenAt: new Date() },
    update: { mailSeenAt: new Date() },
  });

  return Response.json({ ok: true });
}
