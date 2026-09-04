import { prisma } from "@/server/db";

/**
 * Drop everything the app derived from a user's inbox.
 *
 * Shared by sign-out (`events.signOut` in `auth.ts`) and the explicit
 * "Delete my data" endpoint so the two can never drift apart — the guarantee
 * on the login screen is that nothing outlives the session that fetched it.
 *
 * Deleting `EmailRecord` cascades to `AnalysisResult` → `Signal`, plus
 * `GeoIntel`, `UrlMeta` and `AttachmentMeta`, so those need no explicit pass.
 *
 * Deliberately kept:
 *  - `Account` / `UserSettings` — no mail content, and keeping them is what
 *    makes signing back in a plain re-scan instead of a fresh OAuth consent.
 *  - `DomainReputation` / `DnsCache` — public DNS/RDAP/geo facts about domains
 *    and IPs, shared across users and derived from no one's mailbox.
 */
export async function wipeUserMail(userId: string): Promise<number> {
  // deleteMany with an undefined userId would match every row, so refuse
  // rather than trust the caller to have checked.
  if (!userId) return 0;

  const [{ count }] = await prisma.$transaction([
    prisma.emailRecord.deleteMany({ where: { userId } }),
    prisma.scanJob.deleteMany({ where: { userId } }),
  ]);
  return count;
}
