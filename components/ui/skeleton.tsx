import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Uses a scanner-style sweep rather than a pulse —
 * it reads as data arriving, which is what's actually happening.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-lg", className)} {...props} />;
}

/** Placeholder shaped like a table, so the page doesn't jump when rows land. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${70 - i * 4}%` }} />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
