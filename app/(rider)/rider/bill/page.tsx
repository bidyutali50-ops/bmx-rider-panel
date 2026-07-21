"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, Download, CircleAlert, CheckCircle2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";
import { useMyProfile } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { buildPayslipHTML } from "@/lib/payslip";

interface Day {
  date: string;
  weekday: string;
  type: string;
  eligible_for_mg: boolean;
  orders: number;
  amount: number;
  source: string;
  remarks: string | null;
}
interface Bill {
  week_start: string;
  week_end: string;
  pay_by: string;
  total: number;
  cod_orders: number;
  is_final: boolean;
  check_day: string;
  days: Day[];
}

export default function WeeklyBillPage() {
  const supabase = supabaseBrowser();
  const { data: me } = useMyProfile();
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week

  const weekStart = useMemo(() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow + weekOffset * 7);
    return d.toISOString().slice(0, 10);
  }, [weekOffset]);

  const billQ = useQuery({
    queryKey: ["my-weekly-bill", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_weekly_bill", { p_week_start: weekStart });
      if (error) throw error;
      return data as Bill;
    },
  });

  const bill = billQ.data;

  function downloadPayslip() {
    if (!bill || !me) return;
    const html = buildPayslipHTML({
      riderName: me.full_name,
      riderCode: me.rider_code ?? "",
      phone: me.phone ?? "",
      weekStart: bill.week_start,
      weekEnd: bill.week_end,
      payBy: bill.pay_by,
      isFinal: bill.is_final,
      total: bill.total,
      days: bill.days.map((d) => ({
        date: d.date, weekday: d.weekday,
        label: d.eligible_for_mg ? "MG" : "Per order",
        orders: d.orders, amount: d.amount,
      })),
    });
    // Open a print-ready window; the rider chooses "Save as PDF".
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const rangeLabel = bill
    ? `${format(parseISO(bill.week_start), "dd MMM")} – ${format(parseISO(bill.week_end), "dd MMM")}`
    : "";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Weekly Bill</h1>
          <p className="text-sm text-[var(--muted)]">Your pay, day by day</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week"><ChevronLeft /></Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset >= 0} aria-label="Next week"><ChevronRight /></Button>
        </div>
      </div>

      {billQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : !bill ? (
        <EmptyState icon={CalendarRange} title="No bill yet" description="Your weekly pay will show here." />
      ) : (
        <>
          {/* Header card — the week's docket */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-brand-500" /> {rangeLabel}
                </CardTitle>
                {bill.is_final
                  ? <Badge variant="success"><CheckCircle2 className="mr-1 size-3" /> Final</Badge>
                  : <Badge variant="warning">Provisional</Badge>}
              </div>
              <CardDescription>
                {bill.is_final
                  ? `Confirmed. Paid by ${format(parseISO(bill.pay_by), "EEE dd MMM")}.`
                  : `Not final yet — checked on ${format(parseISO(bill.check_day), "EEE dd MMM")}, paid by ${format(parseISO(bill.pay_by), "EEE dd MMM")}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <div>
                  <div className="field-label">Week total</div>
                  <div className="money mt-1 text-3xl font-bold text-brand-600 dark:text-brand-400">{formatINR(bill.total)}</div>
                </div>
                <Button onClick={downloadPayslip} disabled={!bill.days.length}><Download /> Payslip</Button>
              </div>

              {!bill.is_final && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--muted)]">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  This data is not accurate until the final bill check on {format(parseISO(bill.check_day), "EEEE")}. Amounts may change.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Day-by-day */}
          <Card>
            <CardHeader className="pb-2"><CardTitle>Days</CardTitle></CardHeader>
            <CardContent>
              {!bill.days.length ? (
                <EmptyState icon={CalendarRange} title="No work this week" description="Punch in to start earning." />
              ) : (
                <div className="space-y-2">
                  {bill.days.map((d) => (
                    <div key={d.date} className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--border)] pb-2 last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {d.weekday} <span className="text-[var(--muted)]">{format(parseISO(d.date), "dd MMM")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                          <Badge variant={d.eligible_for_mg ? "teal" : "muted"}>{d.eligible_for_mg ? "MG" : "Per order"}</Badge>
                          {d.orders > 0 && <span className="money">{d.orders} orders</span>}
                        </div>
                      </div>
                      <div className="money font-semibold">{formatINR(d.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
