import { cn } from "@/lib/utils";

/** Waybill-style rider code chip: mono digits with an orange tick. */
export function RiderChip({ code, className }: { code?: string | null; className?: string }) {
  if (!code) return <span className="text-[var(--muted)]">—</span>;
  return (
    <span
      className={cn(
        "money inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[11px]",
        className
      )}
    >
      <span className="inline-block h-3 w-[3px] rounded-full bg-brand-500" />
      {code}
    </span>
  );
}
