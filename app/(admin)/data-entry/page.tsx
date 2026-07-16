"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Loader2, Save, Calculator } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useRiders } from "@/lib/hooks";
import { calculateEarnings } from "@/lib/earnings";
import { formatINR, todayISO } from "@/lib/utils";
import { pushNotification, logActivity } from "@/lib/notify";
import type { DataEntry, RateCard, PaymentType } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { RiderChip } from "@/components/app/rider-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface EntryForm {
  total_orders: number; completed_orders: number; cancelled_orders: number;
  cod_orders: number; cod_amount: number; distance_km: number;
  incentive: number; penalty: number; remarks: string;
}
const blank: EntryForm = { total_orders: 0, completed_orders: 0, cancelled_orders: 0, cod_orders: 0, cod_amount: 0, distance_km: 0, incentive: 0, penalty: 0, remarks: "" };

export default function DataEntryPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const [date, setDate] = useState(todayISO());
  const [hubId, setHubId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [form, setForm] = useState<EntryForm>(blank);
  const [saving, setSaving] = useState(false);

  const { data: hubs } = useHubs();
  const { data: riders, isLoading: ridersLoading } = useRiders({ activeOnly: true });

  const hubRiders = useMemo(
    () => (riders ?? []).filter((r) => !hubId || r.hub_id === hubId),
    [riders, hubId]
  );
  const rider = hubRiders.find((r) => r.id === riderId) ?? null;

  const rateQ = useQuery({
    queryKey: ["rate-card", riderId],
    enabled: !!riderId,
    queryFn: async () => {
      const { data } = await supabase.from("rate_cards").select("*").eq("rider_id", riderId)
        .order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return (data ?? null) as RateCard | null;
    },
  });

  const existingQ = useQuery({
    queryKey: ["entry", riderId, date],
    enabled: !!riderId && !!date,
    queryFn: async () => {
      const { data } = await supabase.from("data_entries").select("*")
        .eq("rider_id", riderId).eq("entry_date", date).maybeSingle();
      return (data ?? null) as DataEntry | null;
    },
  });

  const entriesTodayQ = useQuery({
    queryKey: ["entries-for-date", date, hubId],
    queryFn: async () => {
      let q = supabase.from("data_entries")
        .select("*, profiles!data_entries_rider_id_fkey(full_name, rider_code)")
        .eq("entry_date", date).order("created_at", { ascending: false });
      if (hubId) q = q.eq("hub_id", hubId);
      const { data } = await q;
      return (data ?? []) as DataEntry[];
    },
  });

  // Prefill when an existing entry loads
  const existing = existingQ.data;
  useEffect(() => {
    if (existing) {
      setForm({
        total_orders: existing.total_orders, completed_orders: existing.completed_orders,
        cancelled_orders: existing.cancelled_orders, cod_orders: existing.cod_orders,
        cod_amount: 0, distance_km: existing.distance_km,
        incentive: Number(existing.extra_incentive ?? 0), penalty: existing.penalty, remarks: existing.remarks ?? "",
      });
    } else {
      setForm(blank);
    }
  }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const paymentType: PaymentType = (rateQ.data?.payment_type ?? rider?.rider_type ?? "per_order") as PaymentType;

  const calc = useMemo(() => {
    if (!rider) return null;
    return calculateEarnings(paymentType, rateQ.data ?? {}, {
      completed_orders: Number(form.completed_orders || 0),
      cod_orders: Number(form.cod_orders || 0),
      distance_km: Number(form.distance_km || 0),
      penalty: Number(form.penalty || 0),
      extra_incentive: Number(form.incentive || 0),
    });
  }, [rider, paymentType, rateQ.data, form]);

  async function save() {
    if (!rider || !calc) { toast.error("Select a rider first"); return; }
    if (form.total_orders > 0 && form.completed_orders > form.total_orders) { toast.error("Completed orders cannot exceed total orders"); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      entry_date: date, hub_id: rider.hub_id, rider_id: rider.id,
      entered_by: userData.user?.id ?? null, payment_type: paymentType,
      total_orders: Number(form.total_orders || 0), completed_orders: Number(form.completed_orders || 0),
      cancelled_orders: Number(form.cancelled_orders || 0), cod_orders: Number(form.cod_orders || 0),
      distance_km: Number(form.distance_km || 0),
      earnings: calc.earnings, incentive: calc.incentive, extra_incentive: Number(form.incentive || 0), penalty: calc.penalty,
      remarks: form.remarks.trim() || null,
      // An admin typed this. Protect it: punches and client imports must not overwrite it.
      source: "manual", auto_generated: false,
    };
    const { error } = await supabase.from("data_entries").upsert(payload, { onConflict: "rider_id,entry_date" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(existing ? "Entry updated" : "Entry saved", { description: `${rider.full_name} · Net ${formatINR(calc.net)}` });
    pushNotification({
      user_id: rider.id, type: "earning", title: `Earnings updated for ${date}`,
      body: `Net amount ${formatINR(calc.net)} (${form.completed_orders} orders).`,
    });
    logActivity(existing ? "Updated data entry" : "Created data entry", "data_entry", undefined, { rider: rider.full_name, date, net: calc.net });
    qc.invalidateQueries({ queryKey: ["entry", riderId, date] });
    qc.invalidateQueries({ queryKey: ["entries-for-date"] });
    qc.invalidateQueries({ queryKey: ["pending-entries"] });
    setRiderId(""); setForm(blank);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Data Entry" description="Record orders and earnings per rider — net amount is calculated automatically" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Entry Details</CardTitle>
            <CardDescription>Pick the date, hub and rider, then fill in the day&apos;s numbers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hub</Label>
                <Select value={hubId} onChange={(e) => { setHubId(e.target.value); setRiderId(""); }}>
                  <option value="">All hubs</option>
                  {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rider</Label>
                <Select value={riderId} onChange={(e) => setRiderId(e.target.value)} disabled={ridersLoading}>
                  <option value="">Select rider…</option>
                  {hubRiders.map((r) => <option key={r.id} value={r.id}>{r.full_name} {r.rider_code ? `(${r.rider_code})` : ""}</option>)}
                </Select>
              </div>
            </div>

            {rider && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-sm">
                  <RiderChip code={rider.rider_code} />
                  <span className="font-medium">{rider.full_name}</span>
                  <Badge variant={paymentType === "mg" ? "teal" : "default"}>{paymentType === "mg" ? "MG model" : "Per Order model"}</Badge>
                  {existing && <Badge variant="warning">Editing existing entry</Badge>}
                  {!rateQ.data && !rateQ.isLoading && <Badge variant="danger">No rate card — using zeros</Badge>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Num label="Total Orders" v={form.total_orders} set={(v) => setForm({ ...form, total_orders: v })} />
                  <Num label="Completed Orders" v={form.completed_orders} set={(v) => setForm({ ...form, completed_orders: v })} />
                  <Num label="Cancelled Orders" v={form.cancelled_orders} set={(v) => setForm({ ...form, cancelled_orders: v })} />
                  <Num label="COD Orders" v={form.cod_orders} set={(v) => setForm({ ...form, cod_orders: v })} />
                  <Num label="Distance (km)" v={form.distance_km} set={(v) => setForm({ ...form, distance_km: v })} decimals />
                  <Num label="Extra Incentive (₹)" v={form.incentive} set={(v) => setForm({ ...form, incentive: v })} decimals />
                  <Num label="Penalty (₹)" v={form.penalty} set={(v) => setForm({ ...form, penalty: v })} decimals />
                </div>
                <div className="space-y-1.5">
                  <Label>Remarks</Label>
                  <Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Optional notes…" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : <Save />} {existing ? "Update Entry" : "Save Entry"}
                  </Button>
                </div>
              </>
            )}
            {!rider && (
              <EmptyState icon={ClipboardList} title="No rider selected" description="Choose a rider above to start entering today's numbers." />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="size-4 text-brand-500" /> Live Calculation</CardTitle>
            <CardDescription>Updates as you type</CardDescription>
          </CardHeader>
          <CardContent>
            {calc ? (
              <div className="space-y-3">
                <div className="space-y-1.5 text-sm">
                  {calc.breakdown.map((line, i) => (
                    <div key={i} className="waybill-rule flex justify-between gap-2 pb-1.5 text-[var(--muted)]">
                      <span>{line.label}</span>
                      <span className={`money ${line.negative ? "text-red-500" : "text-[var(--fg)]"}`}>
                        {line.negative ? "−" : ""}{formatINR(line.value)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-brand-500/10 p-3">
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Net Payable</div>
                  <div className="money mt-0.5 text-2xl font-bold text-brand-600 dark:text-brand-400">{formatINR(calc.net)}</div>
                  <div className="money mt-1 text-xs text-[var(--muted)]">
                    Earnings {formatINR(calc.earnings)} + Incentive {formatINR(calc.incentive)} − Penalty {formatINR(calc.penalty)}
                  </div>
                </div>
                {calc.warnings.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                    {calc.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>
                    ))}
                    {rider && (
                      <a href={`/riders/${rider.id}`} className="inline-block text-xs font-medium text-brand-600 underline dark:text-brand-400">
                        Open Rate Card →
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Select a rider to preview the payout math.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entries for {date}</CardTitle>
          <CardDescription>{entriesTodayQ.data?.length ?? 0} riders recorded{hubId ? " in this hub" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {entriesTodayQ.isLoading ? (
            <Skeleton className="h-24" />
          ) : !entriesTodayQ.data?.length ? (
            <p className="text-sm text-[var(--muted)]">No entries yet for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-2">Rider</th><th className="px-2 py-2">Orders</th><th className="px-2 py-2">COD</th>
                    <th className="px-2 py-2 text-right">Earnings</th><th className="px-2 py-2 text-right">Incentive</th>
                    <th className="px-2 py-2 text-right">Penalty</th><th className="px-2 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesTodayQ.data.map((e) => (
                    <tr key={e.id} className="waybill-rule cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-900" onClick={() => { setRiderId(e.rider_id); }}>
                      <td className="px-2 py-2">
                        <div className="font-medium">{e.profiles?.full_name}</div>
                        <RiderChip code={e.profiles?.rider_code} />
                      </td>
                      <td className="money px-2 py-2">{e.completed_orders}/{e.total_orders}</td>
                      <td className="money px-2 py-2">{e.cod_orders}</td>
                      <td className="money px-2 py-2 text-right">{formatINR(e.earnings)}</td>
                      <td className="money px-2 py-2 text-right text-emerald-600 dark:text-emerald-400">{formatINR(e.incentive)}</td>
                      <td className="money px-2 py-2 text-right text-red-500">{e.penalty ? `−${formatINR(e.penalty)}` : "—"}</td>
                      <td className="money px-2 py-2 text-right font-semibold">{formatINR(e.net_amount)}</td>
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

function Num({ label, v, set, decimals }: { label: string; v: number; set: (v: number) => void; decimals?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        step={decimals ? "0.01" : "1"}
        placeholder="0"
        value={v === 0 ? "" : String(v)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { set(0); return; }
          const parsed = Number(raw);
          set(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
        }}
        className="money"
      />
    </div>
  );
}
