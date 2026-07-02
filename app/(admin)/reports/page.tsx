"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs } from "@/lib/hooks";
import { formatINR, todayISO, monthStartISO, daysAgoISO } from "@/lib/utils";
import type { DataEntry, PayoutRequest } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { ExportButtons } from "@/components/app/export-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type ReportKey = "earnings" | "rider" | "hub" | "payment_type" | "payouts";
type Row = Record<string, string | number>;

export default function ReportsPage() {
  const supabase = supabaseBrowser();
  const [report, setReport] = useState<ReportKey>("earnings");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [hubId, setHubId] = useState("");
  const { data: hubs } = useHubs();

  function preset(kind: "today" | "week" | "month") {
    setTo(todayISO());
    if (kind === "today") setFrom(todayISO());
    if (kind === "week") setFrom(daysAgoISO(6));
    if (kind === "month") setFrom(monthStartISO());
  }

  const entriesQ = useQuery({
    queryKey: ["report-entries", from, to, hubId],
    enabled: report !== "payouts",
    queryFn: async () => {
      let q = supabase.from("data_entries")
        .select("*, profiles!data_entries_rider_id_fkey(full_name, rider_code), hubs(name)")
        .gte("entry_date", from).lte("entry_date", to)
        .order("entry_date", { ascending: false }).limit(5000);
      if (hubId) q = q.eq("hub_id", hubId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DataEntry[];
    },
  });

  const payoutsQ = useQuery({
    queryKey: ["report-payouts", from, to],
    enabled: report === "payouts",
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_requests")
        .select("*, profiles!payout_requests_rider_id_fkey(full_name, rider_code)")
        .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as PayoutRequest[];
    },
  });

  const rows: Row[] = useMemo(() => {
    const entries = entriesQ.data ?? [];
    if (report === "earnings") {
      return entries.map((e) => ({
        Date: e.entry_date,
        Rider: e.profiles?.full_name ?? "", Code: e.profiles?.rider_code ?? "",
        Hub: e.hubs?.name ?? "", Model: e.payment_type === "mg" ? "MG" : "Per Order",
        "Total Orders": e.total_orders, Completed: e.completed_orders, COD: e.cod_orders,
        Earnings: Number(e.earnings), Incentive: Number(e.incentive), Penalty: Number(e.penalty),
        Net: Number(e.net_amount),
      }));
    }
    if (report === "rider") {
      const agg: Record<string, Row> = {};
      for (const e of entries) {
        const k = e.rider_id;
        agg[k] ??= { Rider: e.profiles?.full_name ?? "", Code: e.profiles?.rider_code ?? "", Hub: e.hubs?.name ?? "", Days: 0, Orders: 0, Earnings: 0, Incentive: 0, Penalty: 0, Net: 0 };
        agg[k].Days = Number(agg[k].Days) + 1;
        agg[k].Orders = Number(agg[k].Orders) + e.completed_orders;
        agg[k].Earnings = Number(agg[k].Earnings) + Number(e.earnings);
        agg[k].Incentive = Number(agg[k].Incentive) + Number(e.incentive);
        agg[k].Penalty = Number(agg[k].Penalty) + Number(e.penalty);
        agg[k].Net = Number(agg[k].Net) + Number(e.net_amount);
      }
      return Object.values(agg).sort((a, b) => Number(b.Net) - Number(a.Net));
    }
    if (report === "hub") {
      const agg: Record<string, Row> = {};
      for (const e of entries) {
        const k = e.hubs?.name ?? "No hub";
        agg[k] ??= { Hub: k, Riders: 0, Entries: 0, Orders: 0, Net: 0 };
        agg[k].Entries = Number(agg[k].Entries) + 1;
        agg[k].Orders = Number(agg[k].Orders) + e.completed_orders;
        agg[k].Net = Number(agg[k].Net) + Number(e.net_amount);
      }
      const riderSets: Record<string, Set<string>> = {};
      for (const e of entries) {
        const k = e.hubs?.name ?? "No hub";
        riderSets[k] ??= new Set();
        riderSets[k].add(e.rider_id);
      }
      for (const k of Object.keys(agg)) agg[k].Riders = riderSets[k]?.size ?? 0;
      return Object.values(agg).sort((a, b) => Number(b.Net) - Number(a.Net));
    }
    if (report === "payment_type") {
      const agg: Record<string, Row> = {
        per_order: { Model: "Per Order", Entries: 0, Orders: 0, Earnings: 0, Incentive: 0, Net: 0 },
        mg: { Model: "MG", Entries: 0, Orders: 0, Earnings: 0, Incentive: 0, Net: 0 },
      };
      for (const e of entries) {
        const k = e.payment_type === "mg" ? "mg" : "per_order";
        agg[k].Entries = Number(agg[k].Entries) + 1;
        agg[k].Orders = Number(agg[k].Orders) + e.completed_orders;
        agg[k].Earnings = Number(agg[k].Earnings) + Number(e.earnings);
        agg[k].Incentive = Number(agg[k].Incentive) + Number(e.incentive);
        agg[k].Net = Number(agg[k].Net) + Number(e.net_amount);
      }
      return Object.values(agg);
    }
    // payouts
    return (payoutsQ.data ?? []).map((p) => ({
      Date: new Date(p.created_at).toLocaleDateString("en-IN"),
      Rider: p.profiles?.full_name ?? "", Code: p.profiles?.rider_code ?? "",
      Amount: Number(p.amount), Method: p.method.toUpperCase(), Status: p.status,
      Reference: p.reference_number ?? "", "Paid At": p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-IN") : "",
    }));
  }, [report, entriesQ.data, payoutsQ.data]);

  const totals = useMemo(() => {
    const moneyCols = ["Net", "Earnings", "Incentive", "Penalty", "Amount"];
    const t: Record<string, number> = {};
    for (const r of rows) {
      for (const c of moneyCols) {
        if (typeof r[c] === "number") t[c] = (t[c] ?? 0) + Number(r[c]);
      }
    }
    return t;
  }, [rows]);

  const loading = report === "payouts" ? payoutsQ.isLoading : entriesQ.isLoading;
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const moneyHeader = (h: string) => ["Net", "Earnings", "Incentive", "Penalty", "Amount"].includes(h);

  const reportLabel: Record<ReportKey, string> = {
    earnings: "Daily Earnings", rider: "Rider-wise Summary", hub: "Hub Performance",
    payment_type: "MG vs Per Order", payouts: "Payout History",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Slice earnings, hubs and payouts over any date range"
        actions={<ExportButtons filename={`${report}-${from}-to-${to}`} rows={rows} title={`${reportLabel[report]} · ${from} → ${to}`} />}
      />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <Tabs value={report} onValueChange={(v) => setReport(v as ReportKey)}>
            <TabsList>
              <TabsTrigger value="earnings">Daily Earnings</TabsTrigger>
              <TabsTrigger value="rider">Rider-wise</TabsTrigger>
              <TabsTrigger value="hub">Hub-wise</TabsTrigger>
              <TabsTrigger value="payment_type">MG vs Per Order</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
            </div>
            {report !== "payouts" && (
              <div className="space-y-1.5">
                <Label>Hub</Label>
                <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
                  <option value="">All hubs</option>
                  {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </div>
            )}
            <div className="flex items-end gap-1.5 lg:col-span-2">
              <button onClick={() => preset("today")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:border-brand-500/60">Today</button>
              <button onClick={() => preset("week")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:border-brand-500/60">Last 7 days</button>
              <button onClick={() => preset("month")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:border-brand-500/60">This month</button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{reportLabel[report]}</CardTitle>
          <CardDescription>
            {rows.length} rows · {from} → {to}
            {"Net" in totals && <> · Total Net <span className="money font-semibold text-brand-600 dark:text-brand-400">{formatINR(totals.Net)}</span></>}
            {"Amount" in totals && <> · Total Amount <span className="money font-semibold text-brand-600 dark:text-brand-400">{formatINR(totals.Amount)}</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48" /> : !rows.length ? (
            <EmptyState icon={FileBarChart} title="No data" description="Nothing found for this range and filters." />
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--card)]">
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    {headers.map((h) => (
                      <th key={h} className={`px-2 py-2 ${moneyHeader(h) ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="waybill-rule">
                      {headers.map((h) => (
                        <td key={h} className={`px-2 py-2 ${typeof r[h] === "number" || moneyHeader(h) ? "money" : ""} ${moneyHeader(h) ? "text-right" : ""}`}>
                          {moneyHeader(h) ? formatINR(Number(r[h])) : String(r[h])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
