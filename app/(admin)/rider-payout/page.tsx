"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Layers, Loader2, RefreshCw, Wallet, IndianRupee, Users,
  AlertTriangle, CheckCircle2, Lock, Pencil,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR, daysAgoISO } from "@/lib/utils";
import { logActivity } from "@/lib/notify";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { RiderChip } from "@/components/app/rider-chip";
import { ExportButtons } from "@/components/app/export-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface BatchLine {
  id: string;
  rider_id: string | null;
  client_rider_ref: string;
  rider_name: string;
  client_amount: number;
  mg_days: number;
  po_days: number;
  total_minutes: number;
  orders: number;
  rider_amount: number;
  status: "pending" | "credited" | "paid";
}

export default function PayoutBatchPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState(daysAgoISO(13));
  const [to, setTo] = useState(daysAgoISO(7));
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BatchLine | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "upi" | "bank">("cash");

  const clientsQ = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      if (data?.length && !clientId) setClientId(data[0].id);
      return data as { id: string; name: string }[];
    },
  });

  const batchQ = useQuery({
    queryKey: ["batch", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const [{ data: batch }, { data: lines }] = await Promise.all([
        supabase.from("payout_batches").select("*").eq("id", batchId).single(),
        supabase.from("payout_batch_lines").select("*").eq("batch_id", batchId).order("rider_name"),
      ]);
      return { batch, lines: (lines ?? []) as BatchLine[] };
    },
  });

  const lines = batchQ.data?.lines ?? [];
  const batch = batchQ.data?.batch;
  const isPaid = batch?.status === "paid" || batch?.status === "confirmed";

  const totals = useMemo(() => ({
    client: lines.reduce((s, l) => s + Number(l.client_amount), 0),
    rider: lines.reduce((s, l) => s + Number(l.rider_amount), 0),
    payable: lines.filter((l) => l.rider_id && l.status === "pending").reduce((s, l) => s + Number(l.rider_amount), 0),
    unlinked: lines.filter((l) => !l.rider_id).length,
    paidCount: lines.filter((l) => l.status === "credited" || l.status === "paid").length,
  }), [lines]);

  async function buildBatch() {
    if (!clientId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("build_payout_batch", {
      p_client_id: clientId, p_from: from, p_to: to,
    });
    setBusy(false);
    if (error) { toast.error("Could not build", { description: error.message }); return; }
    setBatchId(data as string);
    qc.invalidateQueries({ queryKey: ["batch"] });
    toast.success("Batch ready", { description: "Rider amounts start from what the client pays. Edit any before confirming." });
  }

  async function saveAmount() {
    if (!editing) return;
    const amt = Number(editValue);
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_batch_line_amount", { p_line_id: editing.id, p_amount: amt });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["batch", batchId] });
  }

  async function confirmPay() {
    if (!batchId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("confirm_payout_batch", { p_batch_id: batchId, p_method: method });
    setBusy(false);
    setConfirmOpen(false);
    if (error) { toast.error("Could not submit", { description: error.message }); return; }
    const res = data as { credited_riders: number; total: number };
    toast.success(`${res.credited_riders} rider wallet(s) credited`, { description: `${formatINR(res.total)} now owed. Pay each rider from their Wallet with a UTR reference.` });
    logActivity("Submitted payout batch", "payout", batchId, res);
    qc.invalidateQueries({ queryKey: ["batch", batchId] });
    qc.invalidateQueries({ queryKey: ["payouts"] });
  }

  const exportRows = lines.map((l) => ({
    Rider: l.rider_name, Ref: l.client_rider_ref,
    "MG Days": l.mg_days, "PO Days": l.po_days,
    Hours: Math.round(Number(l.total_minutes) / 60 * 10) / 10, Orders: l.orders,
    "Client Pays": Number(l.client_amount), "Rider Gets": Number(l.rider_amount),
    Status: l.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Rider Payout" description="Pull client data, set each rider's pay, then pay everyone at once" />

      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setBatchId(null); }}>
              {clientsQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setBatchId(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setBatchId(null); }} />
          </div>
          <div className="flex items-end">
            <Button onClick={buildBatch} disabled={busy || !clientId} className="w-full">
              {busy && !batchId ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch client data
            </Button>
          </div>
        </CardContent>
      </Card>

      {batchQ.isLoading && batchId && <Skeleton className="h-64" />}

      {batchId && lines.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Client Pays Us" value={formatINR(totals.client)} icon={IndianRupee} money tone="teal" />
            <StatCard title="We Pay Riders" value={formatINR(totals.rider)} icon={Wallet} money />
            <StatCard title="Margin" value={formatINR(totals.client - totals.rider)} hint={totals.client ? `${Math.round(((totals.client - totals.rider) / totals.client) * 100)}%` : ""} icon={Users} money tone="brand" />
            <StatCard title={isPaid ? "Credited to Wallets" : "Ready to Submit"} value={isPaid ? `${totals.paidCount} riders` : formatINR(totals.payable)} icon={isPaid ? CheckCircle2 : Wallet} tone={isPaid ? "teal" : "warn"} money={!isPaid} />
          </div>

          {totals.unlinked > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0" />
              {totals.unlinked} rider(s) in this sheet aren&apos;t linked to your riders, so they won&apos;t be paid. Link them on the Client Import page, then fetch again.
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="size-4 text-brand-500" /> Riders
                  {isPaid && <Badge variant="success"><Lock className="mr-1 size-3" /> Paid</Badge>}
                </CardTitle>
                <CardDescription>Tap a rider&apos;s pay to change it. Amounts start from what the client pays.</CardDescription>
              </div>
              <ExportButtons filename={`payout-${from}-to-${to}`} rows={exportRows} title={`Rider Payout ${from} → ${to}`} />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      <th className="px-2 py-2">Rider</th>
                      <th className="px-2 py-2 text-center">MG / PO days</th>
                      <th className="px-2 py-2 text-center">Hours</th>
                      <th className="px-2 py-2 text-center">Orders</th>
                      <th className="px-2 py-2 text-right">Client Pays</th>
                      <th className="px-2 py-2 text-right">Rider Gets</th>
                      <th className="px-2 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="waybill-rule">
                        <td className="px-2 py-2.5">
                          <div className="font-medium">{l.rider_name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                            <span className="money">{l.client_rider_ref}</span>
                            {!l.rider_id && <Badge variant="warning">Not linked</Badge>}
                          </div>
                        </td>
                        <td className="money px-2 py-2.5 text-center">{l.mg_days} / {l.po_days}</td>
                        <td className="money px-2 py-2.5 text-center">{(Number(l.total_minutes) / 60).toFixed(1)}</td>
                        <td className="money px-2 py-2.5 text-center">{l.orders}</td>
                        <td className="money px-2 py-2.5 text-right text-teal-600 dark:text-teal-400">{formatINR(l.client_amount)}</td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            disabled={isPaid || l.status === "paid" || !l.rider_id}
                            onClick={() => { setEditing(l); setEditValue(String(l.rider_amount)); }}
                            className="money inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline disabled:text-[var(--fg)] disabled:no-underline dark:text-brand-400"
                          >
                            {formatINR(l.rider_amount)}
                            {!isPaid && l.status !== "paid" && l.rider_id && <Pencil className="size-3 opacity-60" />}
                          </button>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {l.status === "credited" || l.status === "paid" ? <Badge variant="success">In wallet</Badge>
                            : l.rider_id ? <Badge variant="muted">Pending</Badge>
                            : <Badge variant="warning">—</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!isPaid && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-brand-500/10 p-3">
                  <span className="text-sm">
                    Credit <span className="font-semibold">{lines.filter((l) => l.rider_id && l.status === "pending").length}</span> linked rider wallet(s) ·{" "}
                    <span className="money font-semibold text-brand-600 dark:text-brand-400">{formatINR(totals.payable)}</span>
                  </span>
                  <Button onClick={() => setConfirmOpen(true)} disabled={totals.payable <= 0}><Wallet /> Submit to wallets</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {batchId && !batchQ.isLoading && lines.length === 0 && (
        <EmptyState icon={Layers} title="No client data for this period" description="Import the client's sheet first, then fetch again." />
      )}

      {/* Edit amount */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`Set pay for ${editing.rider_name}`} description={`Client pays ${formatINR(editing.client_amount)} for ${editing.mg_days} MG + ${editing.po_days} per-order day(s).`}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Rider gets (₹)</Label>
                <Input type="number" min={0} step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="money" autoFocus />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={() => setEditValue(String(editing.client_amount))} className="rounded-lg border border-[var(--border)] px-2 py-1 hover:bg-[var(--card)]">Match client ({formatINR(editing.client_amount)})</button>
                <button onClick={() => setEditValue("0")} className="rounded-lg border border-[var(--border)] px-2 py-1 hover:bg-[var(--card)]">Zero</button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveAmount} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Confirm & pay */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Submit to rider wallets" description={`This credits ${lines.filter((l) => l.rider_id && l.status === "pending").length} rider wallet(s) a total of ${formatINR(totals.payable)} as money owed. You then pay each rider from their Wallet and enter the UTR. This can't be undone.`}>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--card)] p-3 text-sm text-[var(--muted)]">
              After submitting, open each rider → <span className="font-medium text-[var(--fg)]">Wallet → Record Payment</span> to pay them (UPI/bank/cash) and save the UTR reference.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button onClick={confirmPay} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Wallet />} Credit {formatINR(totals.payable)}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
