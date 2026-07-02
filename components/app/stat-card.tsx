"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCard({
  label,
  title,
  value,
  icon: Icon,
  hint,
  tone = "default",
  loading,
  index = 0,
  money,
}: {
  label?: string;
  title?: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: "default" | "brand" | "success" | "warning" | "warn" | "danger" | "teal";
  loading?: boolean;
  index?: number;
  money?: boolean;
}) {
  const heading = title ?? label ?? "";
  const tones: Record<string, string> = {
    default: "text-brand-500 bg-brand-500/10",
    brand: "text-brand-500 bg-brand-500/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-amber-500 bg-amber-500/10",
    warn: "text-amber-500 bg-amber-500/10",
    danger: "text-red-500 bg-red-500/10",
    teal: "text-teal-500 bg-teal-500/10",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.21, 0.6, 0.35, 1] }}
      className="glass rounded-[var(--radius-card)] p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{heading}</p>
        <span className={cn("rounded-lg p-1.5", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight", money ? "money" : "font-display")}>
          {value}
        </p>
      )}
      {hint && <p className="mt-1 truncate text-xs text-[var(--muted)]">{hint}</p>}
    </motion.div>
  );
}
