"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Wallet, IndianRupee, Package, TrendingUp, ArrowRight, CalendarCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { formatINR, todayISO, monthStartISO, daysAgoISO } from "@/lib/utils";
import type { DataEntry, RiderWallet } from "@/lib/types";
import { StatCard } from "@/components/app/stat-card";
import { RiderChip } from "@/components/app/rider-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RiderHomePage() {
  const supabase = supabaseBrowser();
  const { data: me } = useMyProfile();

  const walletQ = useQuery({
    queryKey: ["my-wallet"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("rider_wallets").select("*").eq("rider_id", me!.id).maybeSingle();
      return (data ?? { total_earned: 0, total_paid: 0, pending_amount: 0, wallet_balance: 0 }) as RiderWallet;
    },
  });

  const earningsQ = useQuery({
    queryKey: ["my-earnings"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("data_entries")
        .select("entry_date, completed_orders, total_orders, cod_orders, earnings, incentive, penalty, net_amount, remarks")
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

  const todayNet = sum(entries.filter((e) => e.entry_date === today));
  const weekNet = sum(entries.filter((e) => e.entry_date >= weekStart));
  const monthNet = sum(entries.filter((e) => e.entry_date >= monthStart));
  const monthOrders = entries.filter((e) => e.entry_date >= monthStart).reduce((s, r) => s + r.completed_orders, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Hi, {me?.full_name?.split(" ")[0] ?? "Rider"} 👋</h1>
          <div className="mt-1 flex items-center gap-2">
            <RiderChip code={me?.rider_code} />
            <Badge variant={me?.rider_type === "mg" ? "teal" : "default"}>{me?.rider_type === "mg" ? "MG" : "Per Order"}</Badge>
            {me?.hubs?.name && <span className="text-xs text-[var(--muted)]">{me.hubs.name}</span>}
          </div>
        </div>
        <Button asChild size="sm"><Link href="/rider/payouts">Request Payout <ArrowRight /></Link></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Wallet Balance" value={formatINR(walletQ.data?.wallet_balance ?? 0)} icon={Wallet} money tone="brand" />
        <StatCard title="Today" value={formatINR(todayNet)} icon={IndianRupee} money />
        <StatCard title="Last 7 Days" value={formatINR(weekNet)} icon={TrendingUp} money tone="teal" />
        <StatCard title="This Month" value={formatINR(monthNet)} hint={`${monthOrders} orders`} icon={Package} money />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent Earnings</CardTitle>
            <CardDescription>Last 30 days, newest first</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm"><Link href="/rider/attendance"><CalendarCheck /> Attendance</Link></Button>
        </CardHeader>
        <CardContent>
          {earningsQ.isLoading ? <Skeleton className="h-40" /> : !entries.length ? (
            <p className="text-sm text-[var(--muted)]">No earnings recorded yet. Your hub will enter your daily numbers.</p>
          ) : (
            <div className="space-y-2">
              {entries.slice(0, 15).map((e) => (
                <div key={e.entry_date} className="waybill-rule flex items-center justify-between gap-3 pb-2">
                  <div>
                    <div className="money text-sm font-medium">{new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" })}</div>
                    <div className="text-xs text-[var(--muted)]">{e.completed_orders}/{e.total_orders} orders · {e.cod_orders} COD</div>
                  </div>
                  <div className="text-right">
                    <div className="money font-semibold text-brand-600 dark:text-brand-400">{formatINR(e.net_amount)}</div>
                    {Number(e.penalty) > 0 && <div className="money text-xs text-red-500">−{formatINR(e.penalty)} penalty</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
