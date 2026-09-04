import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-grid flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Logo withText={false} className="scale-125" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        That page doesn&apos;t exist, or the email it points to isn&apos;t
        yours to see.
      </p>
      <Link href="/dashboard">
        <Button size="sm">Back to dashboard</Button>
      </Link>
    </main>
  );
}
