"use client";

import { useCallback, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, CreditCard } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { daysAgoISO, formatINR } from "@/lib/utils";
import { RiderChip } from "@/components/app/rider-chip";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface RiderSummary {
  rider_id: string;
  rider_name: string;
  rider_code: string | null;
  hub_name: string | null;
  mg_days: number;
  po_days: number;
  mg_amount: number;
  po_amount: number;
  total: number;
  paid: number;
  pending: number;
  due: number;
}

export default function SettlementsPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [from, setFrom] = useState(daysAgoISO(6));
  const [to, setTo] = useState(daysAgoISO(0));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const summaryQ = useQuery({
    queryKey: ["rider-payout-summary", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rider_payout_summary", { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as RiderSummary[];
    },
  });

  const summary = useMemo(
    () => summaryQ.data?.map((r) => ({ ...r, total: Number(r.total), paid: Number(r.paid), due: Number(r.due) })) ?? [],
    [summaryQ.data]
  );

  const settleable = summary.filter((r) => r.due > 0.005);
  const selectedRows = settleable.filter((r) => selected.has(r.rider_id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.due, 0);

  const setWeek = useCallback((d: Date) => {
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - day);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    setFrom(mon.toISOString().slice(0, 10));
    setTo(sun.toISOString().slice(0, 10));
    setSelected(new Set());
  }, []);

  async function settle(rider: RiderSummary | null) {
    const list = rider ? [rider] : selectedRows;
    if (!list.length) { toast.error("Nothing selected"); return; }

    const paid = new Date().toISOString();

    for (const r of list) {
      const { error } = await supabase.from("payout_requests").insert({
        rider_id: r.rider_id,
        amount: r.due,
        method: "cash",
        status: "paid",
        paid_at: paid,
        note: `${format(parseISO(from), "dd MMM")} - ${format(parseISO(to), "dd MMM")}`,
        admin_remarks: "Weekly settlement",
      });
      if (error) { toast.error(error.message); return; }
    }

    toast.success(`Settled ${list.length} rider(s)`, { description: formatINR(list.reduce((s, r) => s + r.due, 0)) });
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["rider-payout-summary"] });
    qc.invalidateQueries({ queryKey: ["payouts"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rider Settlement"
        description="Review and settle rider earnings for a period"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWeek(new Date())}
              disabled={from === daysAgoISO(6) && to === daysAgoISO(0)}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              This Week
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWeek(new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000))}
              disabled={from === daysAgoISO(13) && to === daysAgoISO(7)}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Last Week  
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Period</CardTitle>
            <CardDescription>
              Showing rider earnings from <span className="font-medium text-muted-foreground">{format(parseISO(from), "dd MMM")}</span> to{" "}
              <span className="font-medium text-muted-foreground">{format(parseISO(to), "dd MMM")}</span>
            </CardDescription>  
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="to">To</Label>  
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riders</CardTitle>  
          <CardDescription>
            Showing {summary.length} rider(s) with earnings in this period.{" "}
            {selectedRows.length > 0 && (
              <span className="font-medium text-muted-foreground">
                {selectedRows.length} selected, {formatINR(selectedTotal)} due
              </span>
            )}  
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryQ.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="mt-4 h-8 w-full" />
              <Skeleton className="mt-4 h-8 w-full" />
            </div>
          ) : summary.length === 0 ? (
            <EmptyState 
              icon={CreditCard}
              title="No riders with earnings" 
              description="No riders have earnings in this period." 
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={settleable.length > 0 && settleable.every((r) => selected.has(r.rider_id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(settleable.map((r) => r.rider_id)) : new Set())}
                      />  
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Rider</th>
                    <th className="px-4 py-2 text-left font-medium">MG Days</th>
                    <th className="px-4 py-2 text-left font-medium">PO Days</th>  
                    <th className="px-4 py-2 text-right font-medium">MG Amount</th>
                    <th className="px-4 py-2 text-right font-medium">PO Amount</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>  
                    <th className="px-4 py-2 text-right font-medium">Pending</th>
                    <th className="px-4 py-2 text-right font-medium">Due</th>
                    <th className="px-4 py-2 text-center font-medium"></th>
                  </tr>  
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.rider_id}>
                      <td className="px-4 py-3">
                        {r.due > 0 && (
                          <input  
                            type="checkbox"
                            checked={selected.has(r.rider_id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(r.rider_id);
                              else next.delete(r.rider_id);
                              setSelected(next);
                            }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <RiderChip code={r.rider_code ?? undefined} />  
                          <div>
                            <div className="font-medium">{r.rider_name}</div>
                            <div className="text-sm text-muted-foreground">{r.hub_name}</div>
                          </div>
                        </div>  
                      </td>
                      <td className="px-4 py-3">{r.mg_days}</td>
                      <td className="px-4 py-3">{r.po_days}</td>
                      <td className="px-4 py-3 text-right">{formatINR(r.mg_amount)}</td>  
                      <td className="px-4 py-3 text-right">{formatINR(r.po_amount)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatINR(r.total)}</td>
                      <td className="px-4 py-3 text-right">{formatINR(r.paid)}</td>
                      <td className="px-4 py-3 text-right">{formatINR(r.pending)}</td>  
                      <td className="px-4 py-3 text-right font-medium">{formatINR(r.due)}</td>
                      <td className="px-4 py-3 text-right">
                        {r.due > 0 && (
                          <Button size="sm" onClick={() => settle(r)}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Settle
                          </Button>  
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>  
              </table>
            </div>
          )}  
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => settle(null)} disabled={selectedRows.length === 0}>
          {selectedRows.length === 0 ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Bulk Settle  
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Settle {selectedRows.length} rider(s) ({formatINR(selectedTotal)})  
            </>
          )}
        </Button>
      </div>
    </div>
  );  
}
