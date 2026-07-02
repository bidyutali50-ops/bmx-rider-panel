"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, CheckCheck, Check, X, Loader2, Hourglass, BadgeCheck, Landmark } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pushNotification, logActivity } from "@/lib/notify";
import type { PayoutRequest, PayoutStatus } from "@/lib/types";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_BADGE: Record<PayoutStatus, "warning" | "teal" | "danger" | "success"> = {
  pending: "warning", approved: "teal", rejected: "danger", paid: "success",
};

export default function PayoutsPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const [tab, setTab] = useState<PayoutStatus | "all">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ type: "approve" | "reject" | "paid"; req: PayoutRequest } | null>(null);
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ["payouts", tab],
    queryFn: async () => {
      let q = supabase.from("payout_requests")
        .select("*, profiles!payout_requests_rider_id_fkey(full_name, rider_code, phone, bank_name, account_number, ifsc, upi_id)")
        .order("created_at", { ascending: false }).limit(300);
      if (tab !== "all") q = q.eq("status", tab);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PayoutRequest[];
    },
  });

  const statsQ = useQuery({
    queryKey: ["payout-stats"],
    queryFn: async () => {
      const [p, a, paid] = await Promise.all([
        supabase.from("payout_requests").select("amount").eq("status", "pending"),
        supabase.from("payout_requests").select("amount").eq("status", "approved"),
        supabase.from("payout_requests").select("amount").eq("status", "paid"),
      ]);
      const sum = (rows?: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
      return {
        pendingCount: p.data?.length ?? 0, pendingSum: sum(p.data),
        approvedCount: a.data?.length ?? 0, approvedSum: sum(a.data),
        paidSum: sum(paid.data),
      };
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["payouts"] });
    qc.invalidateQueries({ queryKey: ["payout-stats"] });
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { type, req } = action;
    const update: Record<string, unknown> = { processed_by: userData.user?.id ?? null, processed_at: now, admin_remarks: remarks.trim() || null };
    if (type === "approve") update.status = "approved";
    if (type === "reject") update.status = "rejected";
    if (type === "paid") { update.status = "paid"; update.paid_at = now; update.reference_number = reference.trim() || null; }

    const { error } = await supabase.from("payout_requests").update(update).eq("id", req.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }

    const titles = { approve: "Payout approved", reject: "Payout rejected", paid: "Payout paid" };
    const bodies = {
      approve: `Your payout request of ${formatINR(req.amount)} has been approved.`,
      reject: `Your payout request of ${formatINR(req.amount)} was rejected.${remarks ? ` Reason: ${remarks}` : ""}`,
      paid: `${formatINR(req.amount)} has been paid to you.${reference ? ` Ref: ${reference}` : ""}`,
    };
    toast.success(titles[type]);
    pushNotification({ user_id: req.rider_id, type: "payout", title: titles[type], body: bodies[type] });
    logActivity(titles[type], "payout", req.id, { amount: req.amount });
    setAction(null); setReference(""); setRemarks("");
    invalidate();
  }

  async function bulkApprove() {
    if (!selected.size) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const ids = [...selected];
    const { error } = await supabase.from("payout_requests")
      .update({ status: "approved", processed_by: userData.user?.id ?? null, processed_at: new Date().toISOString() })
      .in("id", ids).eq("status", "pending");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} payout(s) approved`);
    const reqs = (listQ.data ?? []).filter((r) => selected.has(r.id));
    for (const r of reqs) {
      pushNotification({ user_id: r.rider_id, type: "payout", title: "Payout approved", body: `Your payout request of ${formatINR(r.amount)} has been approved.` });
    }
    logActivity("Bulk approved payouts", "payout", undefined, { count: ids.length });
    setSelected(new Set());
    invalidate();
  }

  const rows = listQ.data ?? [];
  const exportRows = rows.map((r) => ({
    Date: new Date(r.created_at).toLocaleDateString("en-IN"),
    Rider: r.profiles?.full_name ?? "", Code: r.profiles?.rider_code ?? "",
    Amount: Number(r.amount), Method: r.method, Status: r.status,
    Reference: r.reference_number ?? "", Remarks: r.admin_remarks ?? "",
  }));

  const allSelected = rows.length > 0 && rows.every((r) => r.status !== "pending" || selected.has(r.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payout Requests"
        description="Review, approve and settle rider withdrawal requests"
        actions={<ExportButtons filename={`payouts-${tab}`} rows={exportRows} title={`Payout Requests (${tab})`} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pending" value={formatINR(statsQ.data?.pendingSum ?? 0)} hint={`${statsQ.data?.pendingCount ?? 0} requests`} icon={Hourglass} money tone="warn" />
        <StatCard title="Approved (awaiting payment)" value={formatINR(statsQ.data?.approvedSum ?? 0)} hint={`${statsQ.data?.approvedCount ?? 0} requests`} icon={BadgeCheck} money tone="teal" />
        <StatCard title="Total Paid" value={formatINR(statsQ.data?.paidSum ?? 0)} icon={Landmark} money tone="brand" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as PayoutStatus | "all"); setSelected(new Set()); }}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "pending" && (
          <Button onClick={bulkApprove} disabled={!selected.size || busy}>
            <CheckCheck /> Approve Selected ({selected.size})
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          {listQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : !rows.length ? (
            <EmptyState icon={Banknote} title="Nothing here" description={`No ${tab === "all" ? "" : tab + " "}payout requests found.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    {tab === "pending" && (
                      <th className="px-2 py-2">
                        <input type="checkbox" checked={allSelected} onChange={(e) => {
                          setSelected(e.target.checked ? new Set(rows.filter((r) => r.status === "pending").map((r) => r.id)) : new Set());
                        }} />
                      </th>
                    )}
                    <th className="px-2 py-2">Date</th><th className="px-2 py-2">Rider</th>
                    <th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Destination</th><th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="waybill-rule">
                      {tab === "pending" && (
                        <td className="px-2 py-2.5">
                          {r.status === "pending" && (
                            <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(r.id); else next.delete(r.id);
                              setSelected(next);
                            }} />
                          )}
                        </td>
                      )}
                      <td className="money px-2 py-2.5 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium">{r.profiles?.full_name}</div>
                        <RiderChip code={r.profiles?.rider_code} />
                      </td>
                      <td className="money px-2 py-2.5 text-right font-semibold">{formatINR(r.amount)}</td>
                      <td className="px-2 py-2.5 uppercase">{r.method}</td>
                      <td className="money px-2 py-2.5 text-xs">
                        {r.method === "upi"
                          ? r.profiles?.upi_id ?? "—"
                          : r.profiles?.account_number ? `${r.profiles.bank_name ?? ""} ${r.profiles.account_number} ${r.profiles.ifsc ?? ""}` : "—"}
                        {r.reference_number && <div className="text-[var(--muted)]">Ref: {r.reference_number}</div>}
                      </td>
                      <td className="px-2 py-2.5"><Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge></td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {r.status === "pending" && (
                            <>
                              <Button size="sm" variant="success" onClick={() => setAction({ type: "approve", req: r })}><Check /> Approve</Button>
                              <Button size="sm" variant="destructive" onClick={() => setAction({ type: "reject", req: r })}><X /> Reject</Button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <Button size="sm" onClick={() => setAction({ type: "paid", req: r })}><Banknote /> Mark Paid</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        {action && (
          <DialogContent
            title={action.type === "approve" ? "Approve Payout" : action.type === "reject" ? "Reject Payout" : "Mark as Paid"}
            description={`${action.req.profiles?.full_name} · ${formatINR(action.req.amount)} via ${action.req.method.toUpperCase()}`}
          >
            <div className="space-y-3">
              {action.type === "paid" && (
                <div className="space-y-1.5">
                  <Label>Payment Reference Number</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / Transaction ID" className="money" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Remarks {action.type === "reject" ? "(shown to rider)" : "(optional)"}</Label>
                <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
                <Button variant={action.type === "reject" ? "destructive" : "default"} onClick={runAction} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {action.type === "approve" ? "Approve" : action.type === "reject" ? "Reject" : "Confirm Paid"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
