"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock, ChevronLeft, ChevronRight, Loader2, Banknote,
  CheckCircle2, AlertTriangle, Wallet,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";
import { pushNotification, logActivity } from "@/lib/notify";
import { PageHeader } from "@/components/app/page-header";
import { ExportButtons } from "@/components/app/export-buttons";
import { RiderChip } from "@/components/app/rider-chip";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface WeekRow {
  rider_id: string;
  full_name: string;
  rider_code: string | null;
  hub_name: string | null;
  payment_type: string;
  days_worked: number;
  orders: number;
  earned: number;
  paid: number;
  due: number;
}

/** Monday of the week containing `d` */
function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - day);
  return x;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pretty = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function SettlementsPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  // Default to LAST completed week — that's the one that needs settling.
  const [weekStart, setWeekStart] = useState<string>(() => iso(addDays(mondayOf(new Date()), -7)));
  const [hub, setHub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [target, setTarget] = useState<WeekRow | null>(null); // null = bulk
  const [method, setMethod] = useState<"cash" | "upi" | "bank">("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const monday = new Date(weekStart + "T00:00:00");
  const sunday = addDays(monday, 6);
  const deadline = addDays(monday, 11); // Friday of the following week
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = today > deadline;
  const dueToday = iso(today) === iso(deadline);

  const rowsQ = useQuery({
    queryKey: ["week-settlements", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("week_settlements", { p_week_start: weekStart });
      if (error) throw error;
      return (data ?? []) as WeekRow[];
    },
  });

  const rows = useMemo(() => {
    const all = (rowsQ.data ?? []).map((r) => ({
      ...r,
      earned: Number(r.earned), paid: Number(r.paid), due: Number(r.due),
      days_worked: Number(r.days_worked), orders: Number(r.orders),
    }));
    return hub ? all.filter((r) => r.hub_name === hub) : all;
  }, [rowsQ.data, hub]);

  const hubs = useMemo(
    () => [...new Set((rowsQ.data ?? []).map((r) => r.hub_name).filter(Boolean))] as string[],
    [rowsQ.data]
  );

  const totals = useMemo(() => ({
    earned: rows.reduce((s, r) => s + r.earned, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    due: rows.reduce((s, r) => s + r.due, 0),
    pendingRiders: rows.filter((r) => r.due > 0.005).length,
  }), [rows]);

  const settleable = rows.filter((r) => r.due > 0.005);
  const selectedRows = settleable.filter((r) => selected.has(r.rider_id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.due, 0);

  function shiftWeek(n: number) {
    setWeekStart(iso(addDays(monday, n * 7)));
    setSelected(new Set());
  }

  function openSettle(row: WeekRow | null) {
    setTarget(row);
    setReference(""); setNote(""); setMethod("cash");
    setPayOpen(true);
  }

  async function runSettle() {
    const list = target ? [target] : selectedRows;
    if (!list.length) { toast.error("Nothing selected"); return; }
    setBusy(true);

    let ok = 0;
    const failures: string[] = [];
    for (const r of list) {
      try {
        const { error } = await supabase.rpc("settle_rider_week", {
          p_rider_id: r.rider_id,
          p_week_start: weekStart,
          p_amount: null, // settle the full outstanding amount
          p_method: method,
          p_reference: reference.trim() || null,
          p_note: note.trim() || null,
        });
        if (error) { failures.push(`${r.full_name}: ${error.message}`); continue; }
        ok++;
        pushNotification({
          user_id: r.rider_id, type: "payout", title: "Weekly payout settled",
          body: `${formatINR(r.due)} for ${pretty(monday)}–${pretty(sunday)} paid via ${method.toUpperCase()}.`,
        });
      } catch (e) {
        failures.push(`${r.full_name}: ${String((e as Error)?.message ?? e)}`);
      }
    }
    setBusy(false);

    if (ok) {
      toast.success(`${ok} rider(s) settled`, { description: formatINR(list.slice(0, ok).reduce((s, r) => s + r.due, 0)) });
      logActivity("Settled weekly payouts", "payout", undefined, { week: weekStart, riders: ok });
    }
    if (failures.length) {
      const net = failures.some((f) => /failed to fetch|networkerror/i.test(f));
      toast.error(`${failures.length} could not be settled`, {
        description: net ? "Network problem — check your connection or ad-blocker." : failures[0],
      });
    }
    setPayOpen(false); setSelected(new Set()); setTarget(null);
    qc.invalidateQueries({ queryKey: ["week-settlements"] });
    qc.invalidateQueries({ queryKey: ["payouts"] });
  }

  const exportRows = rows.map((r) => ({
    Rider: r.full_name, Code: r.rider_code ?? "", Hub: r.hub_name ?? "",
    Model: r.payment_type === "mg" ? "MG" : "Per Order",
    Days: r.days_worked, Orders: r.orders,
    Earned: r.earned, Paid: r.paid, Due: r.due,
    "Week": `${weekStart} to ${iso(sunday)}`,
    "Settle By": iso(deadline),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Settlement"
        description="Monday–Sunday work week, settled by Friday of the following week"
        actions={<ExportButtons filename={`settlement-${weekStart}`} rows={exportRows} title={`Weekly Settlement ${weekStart} → ${iso(sunday)}`} />}
      />

      {/* Week picker */}
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => shiftWeek(-1)} aria-label="Previous week"><ChevronLeft /></Button>
            <div className="min-w-56 text-center">
              <div className="font-display text-base font-bold">{pretty(monday)} – {pretty(sunday)}</div>
              <div className={`money text-xs ${overdue ? "text-red-500" : dueToday ? "text-amber-600 dark:text-amber-400" : "text-[var(--muted)]"}`}>
                Settle by {deadline.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                {overdue && " · OVERDUE"}
                {dueToday && " · DUE TODAY"}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => shiftWeek(1)} aria-label="Next week"><ChevronRight /></Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Jump to week</Label>
              <Input type="date" value={weekStart} onChange={(e) => {
                if (!e.target.value) return;
                setWeekStart(iso(mondayOf(new Date(e.target.value + "T00:00:00"))));
                setSelected(new Set());
              }} />
            </div>
            <div className="space-y-1.5">
              <Label>Hub</Label>
              <Select value={hub} onChange={(e) => { setHub(e.target.value); setSelected(new Set()); }}>
                <option value="">All hubs</option>
                {hubs.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Earned This Week" value={formatINR(totals.earned)} icon={Wallet} money />
        <StatCard title="Already Settled" value={formatINR(totals.paid)} icon={CheckCircle2} money tone="teal" />
        <StatCard title="Still Due" value={formatINR(totals.due)} hint={`${totals.pendingRiders} rider(s)`} icon={AlertTriangle} money tone={totals.due > 0 ? "warn" : "teal"} />
        <StatCard title="Deadline" value={deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} hint={overdue ? "Overdue" : dueToday ? "Due today" : "Upcoming"} icon={CalendarClock} tone={overdue ? "warn" : "brand"} />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-brand-500/10 p-3">
          <span className="text-sm">
            <span className="font-semibold">{selected.size}</span> rider(s) selected ·{" "}
            <span className="money font-semibold text-brand-600 dark:text-brand-400">{formatINR(selectedTotal)}</span>
          </span>
          <Button onClick={() => openSettle(null)}><Banknote /> Settle Selected</Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Riders</CardTitle>
          <CardDescription>Earnings are the sum of daily net amounts for this week. Settling records a paid payout tagged to the week.</CardDescription>
        </CardHeader>
        <CardContent>
          {rowsQ.isLoading ? <Skeleton className="h-48" /> : !rows.length ? (
            <EmptyState icon={CalendarClock} title="No riders" description="No active riders for this hub." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={settleable.length > 0 && settleable.every((r) => selected.has(r.rider_id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(settleable.map((r) => r.rider_id)) : new Set())}
                      />
                    </th>
                    <th className="px-2 py-2">Rider</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2 text-center">Days</th>
                    <th className="px-2 py-2 text-center">Orders</th>
                    <th className="px-2 py-2 text-right">Earned</th>
                    <th className="px-2 py-2 text-right">Settled</th>
                    <th className="px-2 py-2 text-right">Due</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isDue = r.due > 0.005;
                    return (
                      <tr key={r.rider_id} className="waybill-rule">
                        <td className="px-2 py-2.5">
                          {isDue && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.rider_id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(r.rider_id); else next.delete(r.rider_id);
                                setSelected(next);
                              }}
                            />
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium">{r.full_name}</div>
                          <div className="flex items-center gap-1.5">
                            <RiderChip code={r.rider_code} />
                            {r.hub_name && <span className="text-xs text-[var(--muted)]">{r.hub_name}</span>}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge variant={r.payment_type === "mg" ? "teal" : "default"}>{r.payment_type === "mg" ? "MG" : "Per Order"}</Badge>
                        </td>
                        <td className="money px-2 py-2.5 text-center">{r.days_worked}</td>
                        <td className="money px-2 py-2.5 text-center">{r.orders}</td>
                        <td className="money px-2 py-2.5 text-right">{formatINR(r.earned)}</td>
                        <td className="money px-2 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{formatINR(r.paid)}</td>
                        <td className={`money px-2 py-2.5 text-right font-semibold ${isDue ? "text-brand-600 dark:text-brand-400" : "text-[var(--muted)]"}`}>
                          {formatINR(r.due)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {isDue ? (
                            <Button size="sm" onClick={() => openSettle(r)}><Banknote /> Settle</Button>
                          ) : r.earned > 0 ? (
                            <Badge variant="success">Settled</Badge>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">No work</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent
          title={target ? `Settle ${target.full_name}` : `Settle ${selectedRows.length} rider(s)`}
          description={`Week ${pretty(monday)}–${pretty(sunday)} · paying ${formatINR(target ? target.due : selectedTotal)} in full`}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "upi" | "bank")}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank Transfer</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference {method === "cash" ? "(optional)" : "(UTR / Txn ID)"}</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} className="money" placeholder={method === "cash" ? "Voucher no." : "UTR / Transaction ID"} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Weekly settlement ${pretty(monday)}–${pretty(sunday)}`} />
            </div>
            {!target && selectedRows.length > 1 && reference.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                The same reference will be saved against all {selectedRows.length} riders.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button onClick={runSettle} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Banknote />} Pay {formatINR(target ? target.due : selectedTotal)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
