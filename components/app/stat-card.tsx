"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A figure on the console. Left rule in the tone colour (like a ledger stripe),
 * mono value, small caps label — reads as a printed metric, not a marketing tile.
 */
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
  const rule: Record<string, string> = {
    default: "bg-brand-500", brand: "bg-brand-500",
    success: "bg-emerald-500", warning: "bg-amber-500", warn: "bg-amber-500",
    danger: "bg-red-500", teal: "bg-teal-500",
  };
  const ink: Record<string, string> = {
    default: "text-brand-500", brand: "text-brand-500",
    success: "text-emerald-500", warning: "text-amber-500", warn: "text-amber-500",
    danger: "text-red-500", teal: "text-teal-500",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32, ease: [0.21, 0.6, 0.35, 1] }}
      className="surface relative overflow-hidden rounded-[var(--radius-card)] p-4 pl-5"
    >
      {/* ledger stripe */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", rule[tone])} />
      <div className="flex items-center justify-between">
        <p className="field-label">{heading}</p>
        <Icon className={cn("size-4", ink[tone])} />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className={cn("mt-1.5 text-2xl font-bold tracking-tight", money ? "money tabular-nums" : "font-display")}>
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{hint}</p>}
    </motion.div>
  );
}
