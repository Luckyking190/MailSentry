import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-80" />
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-56" />
    </div>
  );
}
