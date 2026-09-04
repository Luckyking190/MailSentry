import { auth } from "@/server/auth";
import { wipeUserMail } from "@/server/account/wipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes the user's scanned mail (emails, analysis, scan jobs) — not the
 * account itself, so they stay signed in. Cascades via Prisma relations. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailsDeleted = await wipeUserMail(session.user.id);

  return Response.json({ emailsDeleted });
}
