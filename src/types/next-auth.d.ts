import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    error?: "RefreshFailed";
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    accessToken?: string;
    refreshToken?: string;
    /** Unix seconds */
    expiresAt?: number;
    error?: "RefreshFailed";
  }
}
