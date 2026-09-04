import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the demo-mailbox .eml fixtures into the serverless function that
  // reads them at runtime (Vercel traces file deps; plain fs reads of files
  // outside the module graph are excluded by default).
  outputFileTracingIncludes: {
    "/api/**/*": ["./fixtures/eml/**/*"],
  },
};

export default nextConfig;
