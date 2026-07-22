"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ReceiptText, CalendarCheck, TrendingUp, Wallet, ChevronRight, Package } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { formatINR, todayISO, monthStartISO, daysAgoISO } from "@/lib/utils";
import type { DataEntry, RiderWallet } from "@/lib/types";
import { RiderChip } from "@/components/app/rider-chip";
import { Badge } from "@/components/ui/badge";

/* Figures tick up rather than snapping — premium, and on-brand with .tick */
function useCountUp(target: number, enabled: boolean, ms = 850) {
  const [val, setVal] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setVal(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setVal(target * (1 - Math.pow(1 - p, 3))); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, ms]);
  return val;
}

function Money({ value, animate }: { value: number; animate: boolean }) {
  const v = useCountUp(value, animate);
  return <>{formatINR(Math.round(v))}</>;
}

export default function RiderHomePage() {
  const supabase = supabaseBrowser();
  const reduce = useReducedMotion();
  const anim = !reduce;
  const { data: me } = useMyProfile();

  const walletQ = useQuery({
    queryKey: ["my-wallet"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("rider_wallets").select("*").eq("rider_id", me!.id).maybeSingle();
      return (data ?? { total_earned: 0, total_paid: 0, pending_amount: 0, adjustments: 0, wallet_balance: 0 }) as RiderWallet;
    },
  });

  const eligQ = useQuery({
    queryKey: ["my-payout-eligibility"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_payout_eligibility");
      return data as { available: number; can_request: boolean; reason: string | null; rider_type: string } | null;
    },
  });

  const earningsQ = useQuery({
    queryKey: ["my-earnings"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("data_entries")
        .select("entry_date, completed_orders, total_orders, cod_orders, earnings, penalty, net_amount, remarks")
        .eq("rider_id", me!.id)
        .gte("entry_date", daysAgoISO(30))
        .order("entry_date", { ascending: false });
      return (data ?? []) as DataEntry[];
    },
  });

  const entries = earningsQ.data ?? [];
  const weekStart = daysAgoISO(6);
  const monthStart = monthStartISO();
  const sum = (rows: DataEntry[]) => rows.reduce((s, r) => s + Number(r.net_amount), 0);

  const weekNet = sum(entries.filter((e) => e.entry_date >= weekStart));
  const monthNet = sum(entries.filter((e) => e.entry_date >= monthStart));
  const balance = Number(walletQ.data?.wallet_balance ?? 0);
  const pending = Number(walletQ.data?.pending_amount ?? 0);
  const isMg = me?.rider_type === "mg";
  const ordersToday = entries.find((e) => e.entry_date === todayISO())?.completed_orders ?? 0;

  // Build a continuous 7-day series (fill gaps with 0) for the chart
  const byDate = new Map(entries.map((e) => [e.entry_date, Number(e.net_amount)]));
  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);
    return { iso, label: d.toLocaleDateString("en-IN", { weekday: "short" })[0], net: byDate.get(iso) ?? 0, isToday: iso === todayISO() };
  });
  const peak = Math.max(1, ...last7.map((d) => d.net));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const initials = (me?.full_name ?? "R").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="stagger space-y-4 pb-4">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-500/12 font-display text-sm font-bold text-brand-600 dark:text-brand-400 ring-1 ring-brand-500/20">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="field-label">{greeting}</p>
            <h1 className="truncate font-display text-2xl font-bold leading-tight">{me?.full_name?.split(" ")[0] ?? "Rider"}</h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RiderChip code={me?.rider_code} />
          <Badge variant={isMg ? "teal" : "muted"}>{isMg ? "MG rider" : "Per order"}</Badge>
        </div>
      </div>

      {/* HERO — the pay docket. Layered depth + tear-off strip. */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-white shadow-[0_18px_50px_-18px_rgba(228,87,15,0.65)] ring-1 ring-brand-700/40">
        {/* depth: soft top highlight + route rings */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.22),transparent_60%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full border-[16px] border-white/10" />
        <div aria-hidden className="pointer-events-none absolute right-12 bottom-4 size-20 rounded-full border-[12px] border-white/10" />

        <div className="relative p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-white/85">
              <Wallet className="size-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Wallet balance</span>
            </div>
            {ordersToday > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                <Package className="size-3" /> {ordersToday} today
              </span>
            )}
          </div>

          {walletQ.isLoading ? (
            <div className="mt-2 h-11 w-44 rounded-md bg-white/20 shimmer" />
          ) : (
            <div className="money mt-1 text-[2.6rem] font-bold leading-none tracking-tight tabular-nums">
              <Money value={balance} animate={anim} />
            </div>
          )}
          {pending > 0 && <p className="money mt-1.5 text-xs text-white/85">{formatINR(pending)} being processed</p>}

          <div className="mt-4">
            {eligQ.data?.can_request ? (
              <Link href="/rider/payouts" className="press inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm">
                Request payout <ArrowUpRight className="size-4" />
              </Link>
            ) : (
              <div className="rounded-lg bg-white/15 px-3 py-2 text-xs text-white/90 backdrop-blur">
                {eligQ.data?.reason ?? "Payout not available right now"}
              </div>
            )}
          </div>
        </div>
        {/* perforated tear-off edge */}
        <div aria-hidden className="perf opacity-40" />
      </div>

      {/* This week — figures + a 7-day chart that grows on load */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-end justify-between">
          <div>
            <span className="field-label">This week</span>
            <div className="money mt-0.5 text-2xl font-bold"><Money value={weekNet} animate={anim} /></div>
          </div>
          <div className="text-right">
            <span className="field-label">This month</span>
            <div className="money mt-0.5 text-lg font-bold text-[var(--muted)]"><Money value={monthNet} animate={anim} /></div>
          </div>
        </div>

        {/* Bar track: fixed height so every bar shares one baseline */}
        <div className="mt-4 flex h-[88px] items-end gap-2">
          {last7.map((d, i) => (
            <div key={d.iso} className="flex h-full flex-1 items-end justify-center">
              <motion.div
                initial={{ height: anim ? "2%" : `${Math.max(4, (d.net / peak) * 100)}%` }}
                animate={{ height: `${Math.max(4, (d.net / peak) * 100)}%` }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease: [0.21, 0.6, 0.35, 1] }}
                className={`w-full max-w-[22px] rounded-t-md ${d.isToday ? "bg-brand-500" : d.net > 0 ? "bg-brand-500/30" : "bg-[var(--border)]"}`}
              />
            </div>
          ))}
        </div>
        {/* Labels: same column grid as bars, so they line up exactly */}
        <div className="mt-2 flex gap-2">
          {last7.map((d) => (
            <span key={d.iso} className={`flex-1 text-center text-[10px] font-medium tabular-nums ${d.isToday ? "text-brand-600 dark:text-brand-400" : "text-[var(--muted)]"}`}>
              {d.label}
            </span>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3">
        <Link href="/rider/attendance" className="press flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-brand-500/12 text-brand-600 dark:text-brand-400">
              <CalendarCheck className="size-5" />
            </span>
            <div>
              <div className="font-semibold">Punch in / out</div>
              <div className="text-xs text-[var(--muted)]">Mark your shift for today</div>
            </div>
          </div>
          <ChevronRight className="size-5 text-[var(--muted)]" />
        </Link>
        <Link href="/rider/bill" className="press flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-teal-500/12 text-teal-500">
              <ReceiptText className="size-5" />
            </span>
            <div>
              <div className="font-semibold">Weekly bill</div>
              <div className="text-xs text-[var(--muted)]">Payslip &amp; day-by-day breakdown</div>
            </div>
          </div>
          <ChevronRight className="size-5 text-[var(--muted)]" />
        </Link>
      </div>

      {/* Recent earnings — waybill rows with relative-size bars */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide">
            <TrendingUp className="size-4 text-brand-500" /> Recent earnings
          </h2>
          <span className="text-xs text-[var(--muted)]">Last 30 days</span>
        </div>

        {earningsQ.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg shimmer" />)}
          </div>
        ) : !entries.length ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <Package className="mx-auto size-6 text-[var(--muted)]" />
            <p className="mt-2 text-sm text-[var(--muted)]">No earnings yet. Punch in to start your shift.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {(() => { const rows = entries.slice(0, 12); const listPeak = Math.max(1, ...rows.map((r) => Number(r.net_amount))); return rows.map((e, i) => {
              const amt = Number(e.net_amount);
              const w = Math.min(100, Math.round((amt / listPeak) * 100));
              const d = new Date(e.entry_date + "T00:00:00");
              return (
                <div key={e.entry_date} className={`relative px-4 py-3 ${i > 0 ? "waybill-rule" : ""}`}>
                  <div aria-hidden className="absolute inset-y-0 left-0 rounded-r-md bg-brand-500/[0.07]" style={{ width: `${w}%` }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {d.toLocaleDateString("en-IN", { weekday: "short" })}{" "}
                        <span className="text-[var(--muted)]">{d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {e.completed_orders > 0 ? `${e.completed_orders} orders` : e.remarks?.replace(/^MG · /, "") ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="money font-bold">{formatINR(amt)}</div>
                      {Number(e.penalty) > 0 && <div className="money text-xs text-red-500">−{formatINR(e.penalty)}</div>}
                    </div>
                  </div>
                </div>
              );
            }); })()}
          </div>
        )}
      </div>
    </div>
  );
}
