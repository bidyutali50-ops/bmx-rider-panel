"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
  TrendingUp, IndianRupee, Users,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRiders } from "@/lib/hooks";
import { formatINR } from "@/lib/utils";
import { logActivity } from "@/lib/notify";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ExportButtons } from "@/components/app/export-buttons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface SheetRow {
  ref: string;
  name: string;
  date: string;          // yyyy-mm-dd
  hub: string;
  store: string;
  minutes: number;
  orders: number;
  allocated: number;
  accepted: number;
  allocPct: number;
  eligibility: string;
  clientMg: number;
  clientPerOrder: number;
}

interface SummaryRow {
  client_rider_ref: string;
  rider_name: string;
  rider_id: string | null;
  rider_code: string | null;
  matched: boolean;
  days: number;
  mg_days: number;
  orders: number;
  client_amount: number;
  rider_cost: number;
  margin: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Excel stores dates as a serial number counted from 30 Dec 1899. */
function toISODate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export default function ClientImportPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<SheetRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const { data: riders } = useRiders({ activeOnly: false });

  const clientsQ = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      if (data?.length && !clientId) setClientId(data[0].id);
      return data as { id: string; name: string }[];
    },
  });

  const summaryQ = useQuery({
    queryKey: ["billing-summary", clientId, range?.from, range?.to],
    enabled: !!clientId && !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_billing_summary", {
        p_client_id: clientId, p_from: range!.from, p_to: range!.to,
      });
      if (error) throw error;
      return (data ?? []) as SummaryRow[];
    },
  });

  /** Which client refs in the sheet have no rider mapped in our system? */
  const unmapped = useMemo(() => {
    if (!rows.length || !riders) return [];
    const known = new Set(riders.map((r) => r.client_rider_ref).filter(Boolean) as string[]);
    const seen = new Map<string, string>();
    rows.forEach((r) => { if (!known.has(r.ref)) seen.set(r.ref, r.name); });
    return [...seen.entries()].map(([ref, name]) => ({ ref, name }));
  }, [rows, riders]);

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "raw") ?? wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);

        const parsed: SheetRow[] = [];
        for (const r of json) {
          const date = toISODate(r["date"]);
          const ref = String(r["rider_id"] ?? "").trim();
          if (!date || !ref) continue;
          parsed.push({
            ref,
            name: String(r["Rider Name"] ?? "").trim(),
            date,
            hub: String(r["Hub Name"] ?? "").trim(),
            store: String(r["Store Name"] ?? "").trim(),
            minutes: num(r["minutes"]),
            orders: num(r["Orders Done By Rider"]),
            allocated: num(r["Allocated Orders"]),
            accepted: num(r["Accepted Orders"]),
            allocPct: num(r["Rider Allocatoion %"] ?? r["Rider Allocation %"]),
            eligibility: String(r["Rider's Allocation based Eligibility"] ?? "").trim(),
            clientMg: num(r["MG Amount"]),
            clientPerOrder: num(r["Per Order Amount"]),
          });
        }

        if (!parsed.length) {
          toast.error("No rows found", { description: "Expected a 'Raw' sheet with a date and rider_id column." });
          return;
        }
        const dates = parsed.map((p) => p.date).sort();
        setRows(parsed);
        setFileName(file.name);
        setImported(false);
        setRange({ from: dates[0], to: dates[dates.length - 1] });
        toast.success(`${parsed.length} rows read`, { description: `${dates[0]} → ${dates[dates.length - 1]}` });
      } catch (err) {
        toast.error("Could not read the file", { description: String((err as Error).message) });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function mapRider(ref: string, riderId: string) {
    if (!riderId) return;
    const { error } = await supabase.from("profiles").update({ client_rider_ref: ref }).eq("id", riderId);
    if (error) { toast.error("Could not link rider", { description: error.message }); return; }
    toast.success("Rider linked");
    qc.invalidateQueries({ queryKey: ["riders"] });
  }

  async function runImport() {
    if (!clientId || !rows.length) return;
    setBusy(true); setProgress(0);

    let done = 0, matched = 0;
    const failures: string[] = [];

    for (const r of rows) {
      const { data, error } = await supabase.rpc("import_client_day", {
        p_client_id: clientId,
        p_client_rider_ref: r.ref,
        p_rider_name: r.name,
        p_work_date: r.date,
        p_hub_name: r.hub,
        p_store_name: r.store,
        p_minutes: r.minutes,
        p_orders_done: Math.round(r.orders),
        p_allocated: Math.round(r.allocated),
        p_accepted: Math.round(r.accepted),
        p_allocation_pct: r.allocPct,
        p_eligibility: r.eligibility,
        p_client_mg: r.clientMg,
        p_client_per_order: r.clientPerOrder,
      });
      if (error) failures.push(`${r.name} ${r.date}: ${error.message}`);
      else if ((data as { matched?: boolean })?.matched) matched++;
      done++;
      setProgress(Math.round((done / rows.length) * 100));
    }

    setBusy(false);
    setImported(true);

    if (failures.length) {
      toast.error(`${failures.length} row(s) failed`, { description: failures[0] });
    } else {
      toast.success(`Imported ${rows.length} rows`, { description: `${matched} matched to our riders` });
    }
    logActivity("Imported client work data", "client", clientId, { rows: rows.length, matched });
    qc.invalidateQueries({ queryKey: ["billing-summary"] });
    qc.invalidateQueries({ queryKey: ["entries-for-date"] });
  }

  const s = summaryQ.data ?? [];
  const totals = useMemo(() => ({
    revenue: s.reduce((a, r) => a + Number(r.client_amount), 0),
    cost: s.reduce((a, r) => a + Number(r.rider_cost), 0),
    margin: s.reduce((a, r) => a + Number(r.margin), 0),
    unmatched: s.filter((r) => !r.matched).length,
  }), [s]);

  const exportRows = s.map((r) => ({
    Rider: r.rider_name, "BMX Code": r.rider_code ?? "—", "Client Ref": r.client_rider_ref,
    Days: r.days, "MG Days": r.mg_days, Orders: r.orders,
    "Client Pays": Number(r.client_amount), "Rider Cost": Number(r.rider_cost), Margin: Number(r.margin),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Import & Billing"
        description="Upload the client's weekly sheet — it fills rider earnings and tracks what the client owes"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UploadCloud className="size-4 text-brand-500" /> Upload sheet</CardTitle>
          <CardDescription>Excel file with a <span className="money">Raw</span> sheet (as sent by the client)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clientsQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm">
              <FileSpreadsheet className="size-4 text-brand-500" />
              <span className="font-medium">{fileName}</span>
              <Badge variant="default">{rows.length} rows</Badge>
              {range && <Badge variant="teal">{range.from} → {range.to}</Badge>}
              <Badge variant="muted">{new Set(rows.map((r) => r.ref)).size} riders</Badge>
            </div>
          )}

          {unmapped.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4" /> {unmapped.length} rider(s) in the sheet aren&apos;t linked to your riders
              </p>
              <p className="text-xs text-[var(--muted)]">
                Link them so their earnings are recorded. Unlinked riders are still billed to the client, but no rider is paid.
              </p>
              {unmapped.map((u) => (
                <div key={u.ref} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="money w-20">{u.ref}</span>
                  <span className="min-w-40 flex-1">{u.name}</span>
                  <Select className="max-w-56" defaultValue="" onChange={(e) => mapRider(u.ref, e.target.value)}>
                    <option value="">Link to rider…</option>
                    {riders?.filter((r) => !r.client_rider_ref).map((r) => (
                      <option key={r.id} value={r.id}>{r.full_name} {r.rider_code ? `(${r.rider_code})` : ""}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted)]">
              Rider pay comes from <span className="font-medium">your rate card</span>, not the client&apos;s amounts.
              Hand-entered days are never overwritten.
            </p>
            <Button onClick={runImport} disabled={busy || !rows.length || !clientId}>
              {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {busy ? `Importing ${progress}%` : `Import ${rows.length || ""} rows`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(imported || (range && s.length > 0)) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Client Pays Us" value={formatINR(totals.revenue)} icon={IndianRupee} money tone="teal" />
            <StatCard title="We Pay Riders" value={formatINR(totals.cost)} icon={Users} money />
            <StatCard title="Margin" value={formatINR(totals.margin)} hint={totals.revenue ? `${Math.round((totals.margin / totals.revenue) * 100)}%` : ""} icon={TrendingUp} money tone="brand" />
            <StatCard title="Unlinked Riders" value={String(totals.unmatched)} icon={totals.unmatched ? AlertTriangle : CheckCircle2} tone={totals.unmatched ? "warn" : "teal"} />
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Billing Summary</CardTitle>
                <CardDescription>{range?.from} → {range?.to}</CardDescription>
              </div>
              <ExportButtons filename={`billing-${range?.from}-to-${range?.to}`} rows={exportRows} title={`Client Billing ${range?.from} → ${range?.to}`} />
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-40" /> : !s.length ? (
                <EmptyState icon={FileSpreadsheet} title="Nothing imported yet" description="Upload a sheet and press Import." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-2 py-2">Rider</th>
                        <th className="px-2 py-2 text-center">Days</th>
                        <th className="px-2 py-2 text-center">MG Days</th>
                        <th className="px-2 py-2 text-center">Orders</th>
                        <th className="px-2 py-2 text-right">Client Pays</th>
                        <th className="px-2 py-2 text-right">Rider Cost</th>
                        <th className="px-2 py-2 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.map((r) => (
                        <tr key={r.client_rider_ref} className="waybill-rule">
                          <td className="px-2 py-2.5">
                            <div className="font-medium">{r.rider_name}</div>
                            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                              <span className="money">{r.client_rider_ref}</span>
                              {r.matched ? <Badge variant="success">{r.rider_code}</Badge> : <Badge variant="warning">Not linked</Badge>}
                            </div>
                          </td>
                          <td className="money px-2 py-2.5 text-center">{r.days}</td>
                          <td className="money px-2 py-2.5 text-center">{r.mg_days}</td>
                          <td className="money px-2 py-2.5 text-center">{r.orders}</td>
                          <td className="money px-2 py-2.5 text-right text-teal-600 dark:text-teal-400">{formatINR(r.client_amount)}</td>
                          <td className="money px-2 py-2.5 text-right">{formatINR(r.rider_cost)}</td>
                          <td className={`money px-2 py-2.5 text-right font-semibold ${Number(r.margin) < 0 ? "text-red-500" : "text-brand-600 dark:text-brand-400"}`}>
                            {formatINR(r.margin)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[var(--border)] font-semibold">
                        <td className="px-2 py-2.5">Total</td>
                        <td colSpan={3} />
                        <td className="money px-2 py-2.5 text-right text-teal-600 dark:text-teal-400">{formatINR(totals.revenue)}</td>
                        <td className="money px-2 py-2.5 text-right">{formatINR(totals.cost)}</td>
                        <td className="money px-2 py-2.5 text-right text-brand-600 dark:text-brand-400">{formatINR(totals.margin)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
