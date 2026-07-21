"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowUpRight, ReceiptText, CalendarCheck, Timer, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { formatINR, todayISO, monthStartISO, daysAgoISO } from "@/lib/utils";
import type { DataEntry, RiderWallet } from "@/lib/types";
import { RiderChip } from "@/components/app/rider-chip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function RiderHomePage() {
  const supabase = supabaseBrowser();
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
  const today = todayISO();
  const weekStart = daysAgoISO(6);
  const monthStart = monthStartISO();
  const sum = (rows: DataEntry[]) => rows.reduce((s, r) => s + Number(r.net_amount), 0);

  const weekNet = sum(entries.filter((e) => e.entry_date >= weekStart));
  const monthNet = sum(entries.filter((e) => e.entry_date >= monthStart));
  const balance = Number(walletQ.data?.wallet_balance ?? 0);
  const pending = Number(walletQ.data?.pending_amount ?? 0);
  const isMg = me?.rider_type === "mg";

  // Peak day in the last 7 for the earnings bar scale
  const week = entries.filter((e) => e.entry_date >= weekStart);
  const peak = Math.max(1, ...week.map((e) => Number(e.net_amount)));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5 pb-4">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="field-label">{greeting}</p>
          <h1 className="truncate font-display text-2xl font-bold leading-tight">
            {me?.full_name?.split(" ")[0] ?? "Rider"}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RiderChip code={me?.rider_code} />
          <Badge variant={isMg ? "teal" : "muted"}>{isMg ? "MG rider" : "Per order"}</Badge>
        </div>
      </div>

      {/* HERO — the pay card. The one thing that matters. */}
      <div className="relative overflow-hidden rounded-lg border border-brand-700/40 bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-sm">
        {/* faint route lines in the corner */}
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full border-[14px] border-white/10" />
        <div aria-hidden className="pointer-events-none absolute right-10 bottom-2 size-16 rounded-full border-[10px] border-white/10" />

        <div className="flex items-center gap-1.5 text-white/80">
          <Wallet className="size-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Wallet balance</span>
        </div>

        {walletQ.isLoading ? (
          <div className="mt-2 h-10 w-40 animate-pulse rounded bg-white/20" />
        ) : (
          <div className="money mt-1 text-4xl font-bold tracking-tight tabular-nums">{formatINR(balance)}</div>
        )}

        {pending > 0 && (
          <p className="money mt-1 text-xs text-white/80">{formatINR(pending)} being processed</p>
        )}

        <div className="mt-4">
          {eligQ.data?.can_request ? (
            <Link
              href="/rider/payouts"
              className="press inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-semibold text-brand-700"
            >
              Request payout <ArrowUpRight className="size-4" />
            </Link>
          ) : (
            <div className="rounded-md bg-white/15 px-3 py-2 text-xs text-white/90">
              {eligQ.data?.reason ?? "Payout not available right now"}
            </div>
          )}
        </div>
      </div>

      {/* Two supporting figures — deliberately secondary */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/rider/bill" className="press rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between">
            <span className="field-label">This week</span>
            <ReceiptText className="size-4 text-[var(--muted)]" />
          </div>
          <div className="money mt-1 text-xl font-bold">{formatINR(weekNet)}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">View weekly bill</div>
        </Link>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between">
            <span className="field-label">This month</span>
            <Timer className="size-4 text-[var(--muted)]" />
          </div>
          <div className="money mt-1 text-xl font-bold">{formatINR(monthNet)}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">so far</div>
        </div>
      </div>

      {/* Quick action row */}
      <Link
        href="/rider/attendance"
        className="press flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-brand-500/12 text-brand-600 dark:text-brand-400">
            <CalendarCheck className="size-5" />
          </span>
          <div>
            <div className="font-semibold">Punch in / out</div>
            <div className="text-xs text-[var(--muted)]">Mark your shift for today</div>
          </div>
        </div>
        <ArrowUpRight className="size-4 text-[var(--muted)]" />
      </Link>

      {/* Earnings with visual rhythm — bars, not a flat list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide">Recent earnings</h2>
          <span className="text-xs text-[var(--muted)]">Last 30 days</span>
        </div>

        {earningsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : !entries.length ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            No earnings yet. Punch in to start your shift.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {entries.slice(0, 12).map((e, i) => {
              const amt = Number(e.net_amount);
              const w = Math.round((amt / peak) * 100);
              const d = new Date(e.entry_date + "T00:00:00");
              return (
                <div key={e.entry_date} className={`relative px-4 py-3 ${i > 0 ? "border-t border-dashed border-[var(--border)]" : ""}`}>
                  {/* subtle bar behind the row showing relative size */}
                  <div aria-hidden className="absolute inset-y-0 left-0 bg-brand-500/[0.06]" style={{ width: `${w}%` }} />
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}
