import NextAuth from "next-auth";

import { authConfig } from "@/server/auth.config";

// Next.js 16 renamed `middleware` → `proxy` (Node.js runtime, no edge).
// Auth.js gates protected routes via the `authorized` callback in authConfig.
export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and the auth API itself.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
