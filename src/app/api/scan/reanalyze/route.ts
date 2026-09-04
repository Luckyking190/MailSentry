import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { parsedEmailFromRecord } from "@/server/mail/fromRecord";
import { persistAnalyzedEmail, loadUserSettings } from "@/server/scan/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REANALYZE = 150;
const SOFT_BUDGET_MS = 270_000;

/** Re-runs the current detector pipeline over the user's existing emails
 * (no Gmail re-fetch) — used after changing weights/thresholds/watchlist. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const userId = session.user.id;
  const settings = await loadUserSettings(userId);

  const emails = await prisma.emailRecord.findMany({
    where: { userId },
    include: { urls: true, attachments: true },
    orderBy: { sentAt: "desc" },
    take: MAX_REANALYZE,
  });

  let processed = 0;
  let failed = 0;
  for (const email of emails) {
    if (Date.now() - started > SOFT_BUDGET_MS) break;
    try {
      const parsed = parsedEmailFromRecord(email);
      await persistAnalyzedEmail({
        userId,
        scanJobId: email.scanJobId,
        source: email.source,
        externalId: email.gmailId ?? email.id,
        parsed,
        settings,
      });
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return Response.json({ processed, failed, total: emails.length });
}
