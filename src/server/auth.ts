import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/server/db";
import { authConfig } from "@/server/auth.config";
import { wipeUserMail } from "@/server/account/wipe";

export { GMAIL_SCOPE } from "@/server/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    /**
     * Drop the user's scanned mail on sign-out. The app holds the contents of
     * a real inbox, so nothing outlives the session that fetched it; the
     * account, settings and the shared intel caches (domain reputation, DNS)
     * are kept, so signing back in is a normal re-scan rather than re-consent.
     *
     * Same scope as POST /api/account/delete-data.
     */
    async signOut(message) {
      // JWT sessions give { token }; the guard also matters because
      // deleteMany({ where: { userId: undefined } }) would match every row.
      const userId =
        "token" in message ? (message.token?.userId ?? null) : null;
      if (!userId) return;

      try {
        await wipeUserMail(userId);
      } catch {
        // Never let cleanup failure block the sign-out itself.
      }
    },
  },
});
