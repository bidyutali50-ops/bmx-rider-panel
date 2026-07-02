import { cn } from "@/lib/utils";

/** BM Xpress mark: an orange route line with waypoints. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand-500" />
      <path
        d="M7 22c5-1 4-9 9-10s5 6 9 4"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="1 4"
      />
      <circle cx="7" cy="22" r="2.4" fill="white" />
      <circle cx="25" cy="16" r="2.4" fill="white" />
    </svg>
  );
}

export function BrandLockup({ subtitle = "Payout Console" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <p className="font-display text-[15px] font-bold tracking-tight">BM XPRESS</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">{subtitle}</p>
      </div>
    </div>
  );
}
