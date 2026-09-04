import { google, type gmail_v1 } from "googleapis";

import { prisma } from "@/server/db";

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/**
 * Build an authenticated Gmail client for a user from their stored Google
 * account. The OAuth2 client auto-refreshes the access token when it expires
 * (using the stored refresh token); the `tokens` event persists the new values.
 */
export async function getGmailClient(
  userId: string,
): Promise<gmail_v1.Gmail> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.refresh_token && !account?.access_token) {
    throw new GoogleAuthError("No connected Google account for this user.");
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
    scope: account.scope ?? undefined,
    // google-auth-library builds the Authorization header as
    // `${token_type} ${access_token}` verbatim. Google's OAuth token
    // endpoint (via the Prisma adapter) stores this as lowercase "bearer",
    // but the API itself matches the scheme case-sensitively and silently
    // treats a lowercase "bearer ..." header as no credential at all
    // (401 "missing required authentication credential"). Always use the
    // canonical "Bearer" regardless of what was persisted.
    token_type: "Bearer",
  });

  oauth2.on("tokens", (tokens) => {
    void prisma.account
      .update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token ?? account.access_token,
          expires_at: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : account.expires_at,
          ...(tokens.refresh_token
            ? { refresh_token: tokens.refresh_token }
            : {}),
        },
      })
      .catch(() => {});
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}
