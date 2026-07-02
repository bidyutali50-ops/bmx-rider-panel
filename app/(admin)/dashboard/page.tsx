"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  UserCheck,
  UserX,
  Warehouse,
  Package,
  IndianRupee,
  ClipboardList,
  Hourglass,
  BadgeCheck,
  Banknote,
  CalendarRange,
  Plus,
  Wallet,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR, todayISO, monthStartISO, daysAgoISO } from "@/lib/utils";
import { StatCard } from "@/components/app/stat-card";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MonthlyPayoutChart,
  WeeklyEarningsChart,
  HubPerformanceChart,
  RiderGrowthChart,
  PaymentTypeChart,
} from "@/components/charts/dashboard-charts";
import { formatDistanceToNow } from "date-fns";

interface ActivityLog {
  id: string;
  action: string;
  entity: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const supabase = supabaseBrowser();
  const today = todayISO();

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const monthStart = monthStartISO();
      const [
        riders,
        activeRiders,
        hubs,
        todayEntries,
        pendingPayouts,
        approvedPayouts,
        paidPayouts,
        monthlyPaid,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "rider"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "rider").eq("active", true),
        supabase.from("hubs").select("id", { count: "exact", head: true }),
        supabase.from("data_entries").select("completed_orders, net_amount, rider_id").eq("entry_date", today),
        supabase.from("payout_requests").select("amount").eq("status", "pending"),
        supabase.from("payout_requests").select("amount").eq("status", "approved"),
        supabase.from("payout_requests").select("amount").eq("status", "paid"),
        supabase.from("payout_requests").select("amount").eq("status", "paid").gte("paid_at", monthStart),
      ]);

      const totalRiders = riders.count ?? 0;
      const active = activeRiders.count ?? 0;
      const entries = todayEntries.data ?? [];
      const sum = (rows: { amount: number }[] | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

      return {
        totalRiders,
        activeRiders: active,
        inactiveRiders: totalRiders - active,
        totalHubs: hubs.count ?? 0,
        todaysOrders: entries.reduce((s, e) => s + Number(e.completed_orders), 0),
        todaysEarnings: entries.reduce((s, e) => s + Number(e.net_amount), 0),
        pendingEntry: Math.max(active - new Set(entries.map((e) => e.rider_id)).size, 0),
        pendingPayoutCount: (pendingPayouts.data ?? []).length,
        pendingPayoutAmount: sum(pendingPayouts.data),
        approvedPayout: sum(approvedPayouts.data),
        paidAmount: sum(paidPayouts.data),
        monthlyPayout: sum(monthlyPaid.data),
      };
    },
  });

  const activity = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, action, entity, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as ActivityLog[];
    },
  });

  const chartData = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn: async () => {
      const from90 = daysAgoISO(90);
      const from7 = daysAgoISO(6);
      const [paid, weekEntries, hubEntries, riders] = await Promise.all([
        supabase.from("payout_requests").select("amount, paid_at").eq("status", "paid").gte("paid_at", daysAgoISO(180)),
        supabase.from("data_entries").select("entry_date, net_amount").gte("entry_date", from7),
        supabase.from("data_entries").select("hub_id, completed_orders, net_amount, hubs(name)").gte("entry_date", daysAgoISO(30)),
        supabase.from("profiles").select("created_at, rider_type").eq("role", "rider").gte("created_at", from90),
      ]);
      const allRiders = await supabase.from("profiles").select("rider_type").eq("role", "rider");
      return {
        paid: paid.data ?? [],
        weekEntries: weekEntries.data ?? [],
        hubEntries: (hubEntries.data ?? []) as { hub_id: string | null; completed_orders: number; net_amount: number; hubs: { name: string } | null }[],
        riders: riders.data ?? [],
        allRiders: allRiders.data ?? [],
      };
    },
  });

  const s = stats.data;
  const loading = stats.isLoading;

  const cards = [
    { label: "Total Riders", value: s?.totalRiders ?? 0, icon: Bike },
    { label: "Active Riders", value: s?.activeRiders ?? 0, icon: UserCheck, tone: "success" as const },
    { label: "Inactive Riders", value: s?.inactiveRiders ?? 0, icon: UserX, tone: "danger" as const },
    { label: "Total Hubs", value: s?.totalHubs ?? 0, icon: Warehouse, tone: "teal" as const },
    { label: "Today's Orders", value: s?.todaysOrders ?? 0, icon: Package },
    { label: "Today's Earnings", value: formatINR(s?.todaysEarnings), icon: IndianRupee, money: true },
    { label: "Pending Data Entry", value: s?.pendingEntry ?? 0, icon: ClipboardList, tone: "warning" as const },
    { label: "Pending Payouts", value: s?.pendingPayoutCount ?? 0, icon: Hourglass, tone: "warning" as const, hint: formatINR(s?.pendingPayoutAmount) + " requested" },
    { label: "Approved Payout", value: formatINR(s?.approvedPayout), icon: BadgeCheck, tone: "teal" as const, money: true },
    { label: "Paid Amount", value: formatINR(s?.paidAmount), icon: Banknote, tone: "success" as const, money: true },
    { label: "Monthly Payout", value: formatINR(s?.monthlyPayout), icon: CalendarRange, money: true },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Operations overview · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/data-entry"><ClipboardList /> Data entry</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/riders/new"><Plus /> Onboard rider</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {cards.map((c, i) => (
          <StatCard key={c.label} {...c} loading={loading} index={i} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly payout</CardTitle>
            <CardDescription>Paid payouts, last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.isLoading ? <Skeleton className="h-full w-full" /> : <MonthlyPayoutChart paid={chartData.data!.paid} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly earnings</CardTitle>
            <CardDescription>Net rider earnings, last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.isLoading ? <Skeleton className="h-full w-full" /> : <WeeklyEarningsChart entries={chartData.data!.weekEntries} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hub performance</CardTitle>
            <CardDescription>Completed orders by hub, last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.isLoading ? <Skeleton className="h-full w-full" /> : <HubPerformanceChart entries={chartData.data!.hubEntries} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rider growth</CardTitle>
            <CardDescription>New riders onboarded, last 90 days</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.isLoading ? <Skeleton className="h-full w-full" /> : <RiderGrowthChart riders={chartData.data!.riders} />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Payment models</CardTitle>
            <CardDescription>MG vs Per Order riders</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {chartData.isLoading ? <Skeleton className="h-full w-full" /> : <PaymentTypeChart riders={chartData.data!.allRiders} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest actions across the console</CardDescription>
            </div>
            <Activity className="size-4 text-[var(--muted)]" />
          </CardHeader>
          <CardContent>
            {activity.isLoading && <Skeleton className="h-32 w-full" />}
            {!activity.isLoading && !activity.data?.length && (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                Activity will appear here as your team works — onboarding riders, saving entries, approving payouts.
              </p>
            )}
            <div className="space-y-0">
              {activity.data?.map((a) => (
                <div key={a.id} className="waybill-rule flex items-center gap-3 py-2.5 last:border-0">
                  <span className="size-1.5 rounded-full bg-brand-500" />
                  <p className="flex-1 truncate text-sm">{a.action}</p>
                  <p className="shrink-0 text-xs text-[var(--muted)]">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { href: "/riders/new", label: "Onboard rider", icon: Plus },
          { href: "/data-entry", label: "Enter today's data", icon: ClipboardList },
          { href: "/payouts", label: "Review payouts", icon: Wallet },
          { href: "/pending-entries", label: "Pending entries", icon: AlertTriangle },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="glass flex items-center gap-3 rounded-[var(--radius-card)] p-4 transition-all hover:border-brand-500/50 hover:shadow-md"
          >
            <span className="rounded-lg bg-brand-500/10 p-2 text-brand-500">
              <q.icon className="size-4" />
            </span>
            <span className="text-sm font-medium">{q.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
