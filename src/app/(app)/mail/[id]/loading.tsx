import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-3 w-52" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
