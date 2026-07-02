import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-ink-200/60 dark:bg-ink-800/60", className)}
      {...props}
    />
  );
}
