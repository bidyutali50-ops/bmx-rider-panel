"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, Send, Loader2, Landmark, Hourglass } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { formatINR } from "@/lib/utils";
import { pushNotification } from "@/lib/notify";
import type { PayoutRequest, PayoutStatus, RiderWallet } from "@/lib/types";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BADGE: Record<PayoutStatus, "warning" | "teal" | "danger" | "success"> = {
  pending: "warning", approved: "teal", rejected: "danger", paid: "success",
};

export default function RiderPayoutsPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const { data: me } = useMyProfile();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "upi">("upi");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const walletQ = useQuery({
    queryKey: ["my-wallet"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("rider_wallets").select("*").eq("rider_id", me!.id).maybeSingle();
      return (data ?? { total_earned: 0, total_paid: 0, pending_amount: 0, adjustments: 0, wallet_balance: 0 }) as RiderWallet;
    },
  });

  const historyQ = useQuery({
    queryKey: ["my-payouts"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("payout_requests").select("*")
        .eq("rider_id", me!.id).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as PayoutRequest[];
    },
  });

  const balance = Number(walletQ.data?.wallet_balance ?? 0);

  async function submit() {
    const amt = Number(amount);
    if (!me) return;
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance) { toast.error("Amount exceeds wallet balance", { description: `Available: ${formatINR(balance)}` }); return; }
    if (method === "upi" && !me.upi_id) { toast.error("No UPI ID on file", { description: "Update your profile or choose bank transfer." }); return; }
    if (method === "bank" && !me.account_number) { toast.error("No bank account on file", { description: "Update your profile or choose UPI." }); return; }
    setBusy(true);
    const { error } = await supabase.from("payout_requests").insert({
      rider_id: me.id, amount: amt, method, note: note.trim() || null, status: "pending",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payout requested", { description: `${formatINR(amt)} via ${method.toUpperCase()}` });
    pushNotification({
      audience: "staff", type: "payout", title: "New payout request",
      body: `${me.full_name} requested ${formatINR(amt)} via ${method.toUpperCase()}.`,
    });
    setAmount(""); setNote("");
    qc.invalidateQueries({ queryKey: ["my-payouts"] });
    qc.invalidateQueries({ queryKey: ["my-wallet"] });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Wallet Balance" value={formatINR(balance)} icon={Wallet} money tone="brand" />
        <StatCard title="Pending Requests" value={formatINR(walletQ.data?.pending_amount ?? 0)} icon={Hourglass} money tone="warn" />
        <StatCard title="Total Earned" value={formatINR(walletQ.data?.total_earned ?? 0)} icon={Landmark} money />
        <StatCard title="Total Paid" value={formatINR(walletQ.data?.total_paid ?? 0)} icon={Send} money tone="teal" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Payout</CardTitle>
          <CardDescription>Withdraw from your wallet balance. Requests are reviewed by admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className="money" placeholder={`Up to ${formatINR(balance)}`} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as "bank" | "upi")}>
                <option value="upi">UPI {me?.upi_id ? `(${me.upi_id})` : ""}</option>
                <option value="bank">Bank Transfer {me?.account_number ? `(A/c ...${me.account_number.slice(-4)})` : ""}</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy || !me}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Submit Request
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? <Skeleton className="h-32" /> : !historyQ.data?.length ? (
            <p className="text-sm text-[var(--muted)]">No payout requests yet.</p>
          ) : (
            <div className="space-y-2">
              {historyQ.data.map((p) => (
                <div key={p.id} className="waybill-rule flex items-center justify-between gap-3 pb-2">
                  <div>
                    <div className="money font-semibold">{formatINR(p.amount)} <span className="text-xs font-normal uppercase text-[var(--muted)]">{p.method}</span></div>
                    <div className="text-xs text-[var(--muted)]">
                      {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {p.reference_number && <> · Ref <span className="money">{p.reference_number}</span></>}
                      {p.admin_remarks && <> · {p.admin_remarks}</>}
                    </div>
                  </div>
                  <Badge variant={BADGE[p.status]}>{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
