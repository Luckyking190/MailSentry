import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Gmail read-only scope (restricted). The app stays in Google "Testing" mode for
 * the hackathon; testers are added on the OAuth consent screen.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Routes under these prefixes require a signed-in user. */
const PROTECTED_PREFIXES = ["/dashboard", "/scan", "/mail", "/settings"];

async function refreshGoogleAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? "token_refresh_failed");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    refreshToken: data.refresh_token ?? refreshToken,
  };
}

/**
 * Shared, Prisma-free config. Safe to import from `proxy.ts` (Node runtime) and
 * from the full `auth.ts` (which adds the database adapter).
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: `openid email profile ${GMAIL_SCOPE}`,
        },
      },
    }),
  ],
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const needsAuth = PROTECTED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (needsAuth) return !!auth?.user;
      return true;
    },
    async jwt({ token, account, user }) {
      if (account && user) {
        return {
          ...token,
          userId: user.id,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 60) {
        return token;
      }

      if (!token.refreshToken) return { ...token, error: "RefreshFailed" };
      try {
        const refreshed = await refreshGoogleAccessToken(token.refreshToken);
        return {
          ...token,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
          refreshToken: refreshed.refreshToken,
          error: undefined,
        };
      } catch {
        return { ...token, error: "RefreshFailed" };
      }
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      if (token.error) session.error = token.error;
      return session;
    },
  },
} satisfies NextAuthConfig;
