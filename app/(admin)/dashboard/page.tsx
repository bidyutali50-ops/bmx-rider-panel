"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bike, Warehouse, Package, IndianRupee, ClipboardList,
  Hourglass, Wallet, Plus, ArrowUpRight, Users,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeeklyEarningsChart, HubPerformanceChart } from "@/components/charts/dashboard-charts";

interface Stats {
  total_riders: number;
  active_riders: number;
  hubs: number;
  today_orders: number;
  today_earnings: number;
  today_riders: number;
  pending_amount: number;
  paid_month: number;
  paid_total: number;
  trend: { d: string; amount: number }[];
  hubs_breakdown: { name: string; orders: number; earnings: number }[];
  rider_mix: { mg: number; per_order: number };
}

export default function DashboardPage() {
  const supabase = supabaseBrowser();

  // One round-trip. Everything the page needs is computed server-side.
  const q = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw error;
      return data as Stats;
    },
    staleTime: 60_000,
  });

  const s = q.data;
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        description={today}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" className="press">
              <Link href="/data-entry"><ClipboardList /> Data entry</Link>
            </Button>
            <Button asChild size="sm" className="press">
              <Link href="/riders/new"><Plus /> Add rider</Link>
            </Button>
          </div>
        }
      />

      {/* Signature: the day's waybill. One strip that answers
          "what is happening right now" before anything else. */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--border)] px-4 py-2.5">
          <span className="money text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Today · Live
          </span>
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-500" />
            </span>
            <span className="money text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {s ? `${s.today_riders} on road` : "—"}
            </span>
          </span>
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[var(--card)] p-4 sm:p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-28" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] lg:grid-cols-4">
            <Figure label="Orders delivered" value={String(s?.today_orders ?? 0)} icon={Package} />
            <Figure label="Earned today" value={formatINR(s?.today_earnings ?? 0)} icon={IndianRupee} accent />
            <Figure label="Awaiting payout" value={formatINR(s?.pending_amount ?? 0)} icon={Hourglass} href="/payouts" />
            <Figure label="Paid this month" value={formatINR(s?.paid_month ?? 0)} icon={Wallet} href="/payouts" />
          </div>
        )}

        {/* tear-off edge — the strip reads as something you'd detach */}
        <div className="perf" aria-hidden />
      </section>

      {/* Fleet: quieter, secondary to the day's numbers */}
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Bike} label="Riders"
          value={q.isLoading ? null : `${s?.active_riders ?? 0}`}
          sub={q.isLoading ? "" : `of ${s?.total_riders ?? 0} active`}
          href="/riders"
        />
        <Tile
          icon={Users} label="Pay model"
          value={q.isLoading ? null : `${s?.rider_mix?.mg ?? 0} MG`}
          sub={q.isLoading ? "" : `${s?.rider_mix?.per_order ?? 0} per-order`}
          href="/riders"
        />
        <Tile
          icon={Warehouse} label="Hubs"
          value={q.isLoading ? null : String(s?.hubs ?? 0)}
          sub="live locations"
          href="/hubs"
        />
        <Tile
          icon={Wallet} label="Paid to date"
          value={q.isLoading ? null : formatINR(s?.paid_total ?? 0)}
          sub="all time"
          href="/payouts"
        />
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Earnings, last 7 days</CardTitle>
            <CardDescription>What riders earned each day</CardDescription>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <div className="space-y-3">
                <div className="route-line rounded-full" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <WeeklyEarningsChart
                entries={(s?.trend ?? []).map((t) => ({ entry_date: t.d, net_amount: Number(t.amount) }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by hub</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <div className="space-y-3">
                <div className="route-line rounded-full" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <HubPerformanceChart
                entries={(s?.hubs_breakdown ?? []).map((h) => ({
                  hub_id: h.name,
                  completed_orders: Number(h.orders),
                  hubs: { name: h.name },
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** A figure on the day's waybill. Mono, large, quiet label. */
function Figure({
  label, value, icon: Icon, accent, href,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
  href?: string;
}) {
  const body = (
    <div className="group h-full bg-[var(--card)] p-4 transition-colors hover:bg-[var(--bg)] sm:p-5">
      <div className="flex items-center gap-1.5 text-[var(--muted)]">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate text-[11px] uppercase tracking-wider">{label}</span>
        {href && <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />}
      </div>
      <p
        className={`money tick mt-2 text-2xl font-semibold tracking-tight sm:text-3xl ${
          accent ? "text-brand-600 dark:text-brand-400" : "text-[var(--fg)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
  return href ? <Link href={href} className="press block">{body}</Link> : body;
}

/** Secondary fleet tile. */
function Tile({
  icon: Icon, label, value, sub, href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="press group rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-brand-500/40"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
        <Icon className="size-4 text-[var(--muted)] transition-colors group-hover:text-brand-500" />
      </div>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="money tick mt-2 text-xl font-semibold">{value}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{sub}</p>
    </Link>
  );
}
