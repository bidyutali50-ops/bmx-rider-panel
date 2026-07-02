import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "bg-brand-500/12 text-brand-600 dark:text-brand-400",
        success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        danger: "bg-red-500/12 text-red-600 dark:text-red-400",
        muted: "bg-ink-500/10 text-[var(--muted)]",
        teal: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
