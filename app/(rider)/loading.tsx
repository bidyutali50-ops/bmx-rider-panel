import { Skeleton } from "@/components/ui/skeleton";

/** Rider pages are read on a phone, often on mobile data. Show shape immediately. */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="route-line -mx-4 rounded-full" />

      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-40" />
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
