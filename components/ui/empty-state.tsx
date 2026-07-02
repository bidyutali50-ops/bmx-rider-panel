import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-14 text-center", className)}>
      <div className="rounded-2xl bg-brand-500/10 p-3.5">
        <Icon className="size-6 text-brand-500" />
      </div>
      <p className="font-display font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-[var(--muted)]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
