import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Sign-out wipes the mailbox, so a returning user starts with nothing to
  // show. Sending them to an empty dashboard would dead-end on "run a scan";
  // /scan starts itself and hands back to the dashboard once rows land.
  const hasMail = await prisma.emailRecord.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  redirect(hasMail ? "/dashboard" : "/scan");
}
