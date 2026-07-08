"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Loader2, Wallet, Scale, PencilLine } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";
import { pushNotification, logActivity } from "@/lib/notify";
import type { DataEntry, PayoutRequest, WalletAdjustment, RiderWallet } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type Kind = "earning" | "payout" | "adjustment";
interface LedgerRow {
  key: string;
  id: string;
  kind: Kind;
  date: string;
  label: string;
  amount: number; // signed effect shown to the user
  status?: string;
  deletable: boolean;
}

const KIND_LABEL: Record<Kind, string> = { earning: "Earning", payout: "Payout", adjustment: "Adjustment" };
const KIND_BADGE: Record<Kind, "success" | "warning" | "teal"> = { earning: "success", payout: "warning", adjustment: "teal" };

export function RiderWalletTab({ riderId, riderName }: { riderId: string; riderName: string }) {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [mode, setMode] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<LedgerRow | null>(null);

  const walletQ = useQuery({
    queryKey: ["wallet", riderId],
    queryFn: async () => {
      const { data } = await supabase.from("rider_wallets").select("*").eq("rider_id", riderId).maybeSingle();
      return (data ?? null) as RiderWallet | null;
    },
  });

  const entriesQ = useQuery({
    queryKey: ["wallet-entries", riderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("data_entries")
        .select("id, entry_date, completed_orders, net_amount")
        .eq("rider_id", riderId)
        .order("entry_date", { ascending: false })
        .limit(200);
      return (data ?? []) as DataEntry[];
    },
  });

  const payoutsQ = useQuery({
    queryKey: ["wallet-payouts", riderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payout_requests")
        .select("id, amount, method, status, reference_number, created_at")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as PayoutRequest[];
    },
  });

  const adjQ = useQuery({
    queryKey: ["wallet-adjustments", riderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_adjustments")
        .select("*")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as WalletAdjustment[];
    },
  });

  const ledger: LedgerRow[] = useMemo(() => {
    const rows: LedgerRow[] = [];
    for (const e of entriesQ.data ?? []) {
      rows.push({
        key: `e-${e.id}`, id: e.id, kind: "earning", date: e.entry_date,
        label: `Daily earning · ${e.completed_orders} orders`,
        amount: Number(e.net_amount), deletable: true,
      });
    }
    for (const p of payoutsQ.data ?? []) {
      rows.push({
        key: `p-${p.id}`, id: p.id, kind: "payout", date: p.created_at.slice(0, 10),
        label: `Payout via ${p.method?.toUpperCase() ?? ""}${p.reference_number ? ` · Ref ${p.reference_number}` : ""}`,
        amount: -Number(p.amount), status: p.status, deletable: true,
      });
    }
    for (const a of adjQ.data ?? []) {
      rows.push({
        key: `a-${a.id}`, id: a.id, kind: "adjustment", date: a.created_at.slice(0, 10),
        label: a.reason?.trim() ? a.reason : (Number(a.amount) >= 0 ? "Manual credit" : "Manual debit"),
        amount: Number(a.amount), deletable: true,
      });
    }
    return rows.sort((x, y) => y.date.localeCompare(x.date));
  }, [entriesQ.data, payoutsQ.data, adjQ.data]);

  const loading = walletQ.isLoading || entriesQ.isLoading || payoutsQ.isLoading || adjQ.isLoading;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["wallet", riderId] });
    qc.invalidateQueries({ queryKey: ["wallet-entries", riderId] });
    qc.invalidateQueries({ queryKey: ["wallet-payouts", riderId] });
    qc.invalidateQueries({ queryKey: ["wallet-adjustments", riderId] });
    qc.invalidateQueries({ queryKey: ["riders"] });
  }

  async function saveAdjustment() {
    const raw = Number(amount);
    if (!raw || raw <= 0) { toast.error("Enter an amount greater than 0"); return; }
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const signed = mode === "credit" ? raw : -raw;
    const { error } = await supabase.from("wallet_adjustments").insert({
      rider_id: riderId, amount: signed, reason: reason.trim() || null, created_by: userData.user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === "credit" ? "Money added" : "Money deducted", { description: `${formatINR(raw)} · ${riderName}` });
    pushNotification({
      user_id: riderId, type: "wallet",
      title: mode === "credit" ? "Wallet credited" : "Wallet debited",
      body: `${mode === "credit" ? "+" : "−"}${formatINR(raw)}${reason.trim() ? ` · ${reason.trim()}` : ""}`,
    });
    logActivity(mode === "credit" ? "Credited wallet" : "Debited wallet", "rider", riderId, { amount: signed, reason });
    setAdjustOpen(false); setAmount(""); setReason(""); setMode("credit");
    refresh();
  }

  async function deleteRow(row: LedgerRow) {
    setBusy(true);
    const table = row.kind === "earning" ? "data_entries" : row.kind === "payout" ? "payout_requests" : "wallet_adjustments";
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    setBusy(false);
    if (error) { toast.error("Could not delete", { description: error.message }); return; }
    toast.success(`${KIND_LABEL[row.kind]} deleted`);
    logActivity(`Deleted ${row.kind}`, "rider", riderId, { entry: row.id, amount: row.amount });
    setConfirmDel(null);
    refresh();
  }

  const w = walletQ.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-brand-500" /> Wallet</CardTitle>
            <CardDescription>Balance = earnings + adjustments − paid out</CardDescription>
          </div>
          <Button onClick={() => setAdjustOpen(true)}><PencilLine /> Adjust Money</Button>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-20" /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Balance" value={formatINR(w?.wallet_balance ?? 0)} tone="brand" big />
              <Metric label="Earned" value={formatINR(w?.total_earned ?? 0)} />
              <Metric label="Adjustments" value={`${(w?.adjustments ?? 0) >= 0 ? "+" : ""}${formatINR(w?.adjustments ?? 0)}`} tone={(w?.adjustments ?? 0) < 0 ? "red" : "teal"} />
              <Metric label="Paid Out" value={formatINR(w?.total_paid ?? 0)} />
              <Metric label="Pending" value={formatINR(w?.pending_amount ?? 0)} tone="warn" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scale className="size-4 text-brand-500" /> Ledger</CardTitle>
          <CardDescription>Every earning, payout and adjustment. Delete any wrong entry — the balance updates automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40" /> : !ledger.length ? (
            <EmptyState icon={Scale} title="No wallet activity yet" description="Earnings, payouts and adjustments will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Details</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.key} className="waybill-rule">
                      <td className="money px-2 py-2.5 whitespace-nowrap">
                        {new Date(row.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-2 py-2.5"><Badge variant={KIND_BADGE[row.kind]}>{KIND_LABEL[row.kind]}</Badge></td>
                      <td className="px-2 py-2.5">
                        {row.label}
                        {row.status && <span className="ml-1 text-xs text-[var(--muted)]">({row.status})</span>}
                      </td>
                      <td className={`money px-2 py-2.5 text-right font-semibold ${row.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {row.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(row.amount))}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(row)} aria-label="Delete entry">
                          <Trash2 className="text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust money dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent title="Adjust Wallet" description={`Add or deduct money for ${riderName}. This is recorded in the ledger.`}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setMode("credit")}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "credit" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-[var(--border)]"}`}
              ><Plus className="size-4" /> Add money</button>
              <button
                type="button" onClick={() => setMode("debit")}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "debit" ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "border-[var(--border)]"}`}
              ><Minus className="size-4" /> Deduct money</button>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="money" placeholder="e.g. 200" />
            </div>
            <div className="space-y-1.5">
              <Label>Reason {mode === "debit" ? "(shown to rider)" : "(optional)"}</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "credit" ? "Bonus, incentive, correction…" : "Advance, deduction, correction…"} />
            </div>
            {amount && Number(amount) > 0 && (
              <div className="rounded-lg bg-[var(--card)] p-2.5 text-sm text-[var(--muted)]">
                New balance will be{" "}
                <span className="money font-semibold text-brand-600 dark:text-brand-400">
                  {formatINR((w?.wallet_balance ?? 0) + (mode === "credit" ? Number(amount) : -Number(amount)))}
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdjustOpen(false)}>Cancel</Button>
              <Button onClick={saveAdjustment} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : mode === "credit" ? <Plus /> : <Minus />}
                {mode === "credit" ? "Add Money" : "Deduct Money"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        {confirmDel && (
          <DialogContent title={`Delete this ${KIND_LABEL[confirmDel.kind].toLowerCase()}?`} description="This permanently removes the entry and updates the wallet balance. This cannot be undone.">
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <div className="flex justify-between"><span className="text-[var(--muted)]">{confirmDel.label}</span>
                  <span className={`money font-semibold ${confirmDel.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {confirmDel.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(confirmDel.amount))}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => deleteRow(confirmDel)} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone, big }: { label: string; value: string; tone?: "brand" | "teal" | "warn" | "red"; big?: boolean }) {
  const color =
    tone === "brand" ? "text-brand-600 dark:text-brand-400"
    : tone === "teal" ? "text-teal-600 dark:text-teal-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "red" ? "text-red-500"
    : "text-[var(--fg)]";
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`money ${big ? "text-xl" : "text-lg"} font-bold ${color}`}>{value}</div>
    </div>
  );
}
