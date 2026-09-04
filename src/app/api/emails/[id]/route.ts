import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/emails/[id]">) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const email = await prisma.emailRecord.findFirst({
    where: { id, userId: session.user.id },
    include: {
      analysis: { include: { signals: true } },
      urls: true,
      attachments: true,
      geoIntel: { orderBy: { hopIndex: "asc" } },
    },
  });

  if (!email) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(email);
}
