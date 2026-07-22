"use client";

/**
 * Rider Payout Console — MG + Per-Order earnings engine + settlement.
 * Complements /payouts (withdrawal requests) and /rider-payout (client batches).
 * Backend RPCs live in migration 20260722120000_rider_payout_engine.sql.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";

type SummaryRow = {
  rider_id: string; rider_name: string; rider_code: string | null; hub_name: string | null;
  mg_days: number; po_days: number; mg_amount: number; po_amount: number;
  total: number; paid: number; pending: number; due: number;
};
type BreakdownRow = {
  entry_date: string; payment_type: string; mg_eligible: boolean; orders: number;
  required_orders: number; delivery_pay: number; mg_target: number; mg_topup: number;
  incentive: number; penalty: number; earnings: number; net_amount: number;
};
type BatchLine = {
  id: string; rider_id: string; rider_name: string | null;
  mg_days: number; po_days: number; orders: number; rider_amount: number; status: string;
};

function weekBounds(d = new Date()) {
  const day = (d.getDay() + 6) % 7;
  const from = new Date(d); from.setDate(d.getDate() - day);
  const to = new Date(from); to.setDate(from.getDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function PayoutsConsole() {
  const supabase = supabaseBrowser();
  const qc = useQueryClient();
  const init = weekBounds();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [method, setMethod] = useState<"bank" | "upi" | "cash">("bank");

  const summary = useQuery({
    queryKey: ["settlement-summary", from, to],
    queryFn: async (): Promise<SummaryRow[]> => {
      const { data, error } = await supabase.rpc("rider_payout_summary", { p_from: from, p_to: to });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runEngine = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_earnings_range", { p_from: from, p_to: to });
      if (error) throw error;
      return data as { days: number; net_total: number };
    },
    onSuccess: (d) => {
      toast.success(`Recomputed ${d.days} day(s) · ${formatINR(d.net_total)}`);
      qc.invalidateQueries({ queryKey: ["settlement-summary"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Engine run failed"),
  });

  const buildBatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("build_rider_settlement", { p_from: from, p_to: to, p_hub_id: null });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      setBatchId(id);
      toast.success("Settlement drafted. Review, then credit wallets.");
      qc.invalidateQueries({ queryKey: ["settlement-lines"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not build settlement"),
  });

  const lines = useQuery({
    queryKey: ["settlement-lines", batchId],
    enabled: !!batchId,
    queryFn: async (): Promise<BatchLine[]> => {
      const { data, error } = await supabase
        .from("payout_batch_lines")
        .select("id,rider_id,rider_name,mg_days,po_days,orders,rider_amount,status")
        .eq("batch_id", batchId)
        .order("rider_amount", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const confirmBatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("confirm_payout_batch", { p_batch_id: batchId, p_method: method });
      if (error) throw error;
      return data as { credited_riders: number; total: number };
    },
    onSuccess: (d) => {
      toast.success(`Credited ${d.credited_riders} wallet(s) · ${formatINR(d.total)}`);
      qc.invalidateQueries({ queryKey: ["settlement-lines"] });
      qc.invalidateQueries({ queryKey: ["settlement-summary"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Confirm failed"),
  });

  async function exportBank() {
    if (!batchId) return;
    const { data, error } = await supabase
      .from("payout_batch_lines")
      .select("rider_amount, rider:profiles!payout_batch_lines_rider_id_fkey(full_name,rider_code,bank_name,account_number,ifsc,upi_id,phone)")
      .eq("batch_id", batchId);
    if (error) return toast.error(error.message);
    const rows = (data ?? []).map((l: any) => [
      l.rider?.rider_code ?? "", l.rider?.full_name ?? "", Number(l.rider_amount).toFixed(2),
      l.rider?.bank_name ?? "", l.rider?.account_number ?? "", l.rider?.ifsc ?? "",
      l.rider?.upi_id ?? "", l.rider?.phone ?? "",
    ]);
    const head = ["Rider Code", "Name", "Amount", "Bank", "Account", "IFSC", "UPI", "Phone"];
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `bmx-settlement-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const kpi = useMemo(() => {
    const r = summary.data ?? [];
    return {
      riders: r.length,
      mg: r.reduce((s, x) => s + Number(x.mg_amount), 0),
      po: r.reduce((s, x) => s + Number(x.po_amount), 0),
      total: r.reduce((s, x) => s + Number(x.total), 0),
      due: r.reduce((s, x) => s + Number(x.due), 0),
    };
  }, [summary.data]);

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-800 dark:text-slate-100">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payout Engine</h1>
          <p className="text-sm text-slate-500">Compute MG &amp; per-order pay, then settle to wallets</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600" />
          </label>
          <button onClick={() => runEngine.mutate()} disabled={runEngine.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {runEngine.isPending ? "Computing…" : "Run engine"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Riders" value={String(kpi.riders)} />
        <Kpi label="MG pay" value={formatINR(kpi.mg)} />
        <Kpi label="Per-order pay" value={formatINR(kpi.po)} />
        <Kpi label="Total earned" value={formatINR(kpi.total)} accent />
        <Kpi label="Outstanding" value={formatINR(kpi.due)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Rider</th>
              <th className="px-3 py-2 text-center">MG days</th>
              <th className="px-3 py-2 text-center">PO days</th>
              <th className="px-3 py-2 text-right">MG pay</th>
              <th className="px-3 py-2 text-right">PO pay</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Due</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {summary.isLoading && (<tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>)}
            {summary.data?.length === 0 && (<tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No entries in this period. Run the engine to compute daily pay.</td></tr>)}
            {summary.data?.map((r) => (
              <RiderRow key={r.rider_id} row={r} from={from} to={to}
                open={expanded === r.rider_id}
                onToggle={() => setExpanded(expanded === r.rider_id ? null : r.rider_id)} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Settlement</h2>
            <p className="text-xs text-slate-500">Draft a batch from computed pay, credit wallets, export a bank file.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => buildBatch.mutate()} disabled={buildBatch.isPending}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">
              {buildBatch.isPending ? "Drafting…" : "Build settlement"}
            </button>
            <select value={method} onChange={(e) => setMethod(e.target.value as any)}
              className="rounded-md border border-slate-300 bg-transparent px-2 py-2 text-sm dark:border-slate-600">
              <option value="bank">Bank</option><option value="upi">UPI</option><option value="cash">Cash</option>
            </select>
            <button onClick={() => confirmBatch.mutate()} disabled={!batchId || confirmBatch.isPending}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {confirmBatch.isPending ? "Crediting…" : "Credit wallets"}
            </button>
            <button onClick={exportBank} disabled={!batchId}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">
              Export bank file
            </button>
          </div>
        </div>
        {batchId && (
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2">Rider</th><th className="px-3 py-2 text-center">MG</th>
                  <th className="px-3 py-2 text-center">PO</th><th className="px-3 py-2 text-center">Orders</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.data?.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.rider_name}</td>
                    <td className="px-3 py-2 text-center">{l.mg_days}</td>
                    <td className="px-3 py-2 text-center">{l.po_days}</td>
                    <td className="px-3 py-2 text-center">{l.orders}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatINR(l.rider_amount)}</td>
                    <td className="px-3 py-2 text-center"><Badge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RiderRow({ row, from, to, open, onToggle }: {
  row: SummaryRow; from: string; to: string; open: boolean; onToggle: () => void;
}) {
  const supabase = supabaseBrowser();
  const detail = useQuery({
    queryKey: ["breakdown", row.rider_id, from, to],
    enabled: open,
    queryFn: async (): Promise<BreakdownRow[]> => {
      const { data, error } = await supabase.rpc("rider_earnings_breakdown", { p_from: from, p_to: to, p_rider_id: row.rider_id });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td className="px-3 py-2">
          <div className="font-medium">{row.rider_name}</div>
          <div className="text-xs text-slate-400">{row.rider_code} · {row.hub_name ?? "—"}</div>
        </td>
        <td className="px-3 py-2 text-center">{row.mg_days}</td>
        <td className="px-3 py-2 text-center">{row.po_days}</td>
        <td className="px-3 py-2 text-right">{formatINR(row.mg_amount)}</td>
        <td className="px-3 py-2 text-right">{formatINR(row.po_amount)}</td>
        <td className="px-3 py-2 text-right font-semibold">{formatINR(row.total)}</td>
        <td className={`px-3 py-2 text-right ${row.due > 0 ? "text-amber-600" : "text-slate-400"}`}>{formatINR(row.due)}</td>
        <td className="px-3 py-2 text-right">
          <button onClick={onToggle} className="text-xs font-medium text-indigo-600 hover:underline">{open ? "Hide" : "Details"}</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-3 py-3 dark:bg-slate-800/40">
            {detail.isLoading ? (<div className="text-xs text-slate-400">Loading days…</div>) : (
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">Date</th><th className="py-1">Type</th><th className="py-1 text-center">Orders</th>
                    <th className="py-1 text-right">Delivery</th><th className="py-1 text-right">MG target</th>
                    <th className="py-1 text-right">Top-up</th><th className="py-1 text-right">Incentive</th>
                    <th className="py-1 text-right">Penalty</th><th className="py-1 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data?.map((d) => (
                    <tr key={d.entry_date} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="py-1">{d.entry_date}</td>
                      <td className="py-1"><Badge status={d.payment_type} /></td>
                      <td className="py-1 text-center">{d.orders}{d.required_orders ? <span className="text-slate-400">/{d.required_orders}</span> : null}</td>
                      <td className="py-1 text-right">{formatINR(d.delivery_pay)}</td>
                      <td className="py-1 text-right">{formatINR(d.mg_target)}</td>
                      <td className="py-1 text-right text-indigo-600">{d.mg_topup > 0 ? formatINR(d.mg_topup) : "—"}</td>
                      <td className="py-1 text-right">{formatINR(d.incentive)}</td>
                      <td className="py-1 text-right text-rose-600">{d.penalty > 0 ? "-" + formatINR(d.penalty) : "—"}</td>
                      <td className="py-1 text-right font-medium">{formatINR(d.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    mg: "bg-indigo-100 text-indigo-700", per_order: "bg-slate-100 text-slate-600",
    pending: "bg-amber-100 text-amber-700", credited: "bg-emerald-100 text-emerald-700",
    paid: "bg-emerald-600 text-white",
  };
  const label = status === "per_order" ? "per-order" : status;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-slate-100 text-slate-600"}`}>{label}</span>;
}
