import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { parsedEmailFromRecord } from "@/server/mail/fromRecord";
import { persistAnalyzedEmail, loadUserSettings } from "@/server/scan/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/emails/[id]/reanalyze">,
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const email = await prisma.emailRecord.findFirst({
    where: { id, userId: session.user.id },
    include: { urls: true, attachments: true },
  });
  if (!email) return Response.json({ error: "Not found" }, { status: 404 });

  const settings = await loadUserSettings(session.user.id);
  const parsed = parsedEmailFromRecord(email);

  const { band } = await persistAnalyzedEmail({
    userId: session.user.id,
    scanJobId: email.scanJobId,
    source: email.source,
    externalId: email.gmailId ?? id,
    parsed,
    settings,
  });

  return Response.json({ id, band });
}
