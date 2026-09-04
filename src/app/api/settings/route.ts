import { z } from "zod";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SettingsSchema = z.object({
  scanWindowDays: z.number().int().min(1).max(365),
  maxEmails: z.number().int().min(10).max(2000),
  enableLlm: z.boolean(),
  llmModel: z.string().max(120).nullable(),
  bandThresholds: z.object({
    low: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    high: z.number().min(0).max(100),
    critical: z.number().min(0).max(100),
  }),
  detectorWeights: z.record(z.string(), z.number().min(0).max(1)),
  brandWatchlist: z.array(z.string().max(60)).max(50),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
  });
  return Response.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid settings", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...v },
    update: v,
  });

  return Response.json(settings);
}
