"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, UserCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useRiders } from "@/lib/hooks";
import { todayISO, monthStartISO } from "@/lib/utils";
import { logActivity } from "@/lib/notify";
import type { Attendance, AttendanceStatus } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { ExportButtons } from "@/components/app/export-buttons";
import { RiderChip } from "@/components/app/rider-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "half_day"];
const BADGE: Record<AttendanceStatus, "success" | "danger" | "warning" | "teal"> = {
  present: "success", absent: "danger", late: "warning", half_day: "teal",
};

export default function AttendancePage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const [date, setDate] = useState(todayISO());
  const [hubId, setHubId] = useState("");
  const [month, setMonth] = useState(todayISO().slice(0, 7));

  const { data: hubs } = useHubs();
  const { data: riders, isLoading } = useRiders({ activeOnly: true });

  const dayQ = useQuery({
    queryKey: ["attendance-day", date],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("att_date", date);
      const map: Record<string, Attendance> = {};
      for (const a of (data ?? []) as Attendance[]) map[a.rider_id] = a;
      return map;
    },
  });

  const monthQ = useQuery({
    queryKey: ["attendance-month", month],
    queryFn: async () => {
      const start = `${month}-01`;
      const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
        .toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance").select("rider_id, status")
        .gte("att_date", start).lte("att_date", end);
      const agg: Record<string, Record<AttendanceStatus, number>> = {};
      for (const a of (data ?? []) as { rider_id: string; status: AttendanceStatus }[]) {
        agg[a.rider_id] ??= { present: 0, absent: 0, late: 0, half_day: 0 };
        agg[a.rider_id][a.status]++;
      }
      return agg;
    },
  });

  const hubRiders = useMemo(
    () => (riders ?? []).filter((r) => !hubId || r.hub_id === hubId),
    [riders, hubId]
  );

  async function mark(riderId: string, status: AttendanceStatus) {
    const { error } = await supabase.from("attendance").upsert(
      { rider_id: riderId, att_date: date, status },
      { onConflict: "rider_id,att_date" }
    );
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["attendance-day", date] });
    qc.invalidateQueries({ queryKey: ["attendance-month"] });
    logActivity(`Marked ${status}`, "attendance", riderId, { date });
  }

  const dayRows = hubRiders.map((r) => {
    const a = dayQ.data?.[r.id];
    return {
      Rider: r.full_name, Code: r.rider_code ?? "", Hub: r.hubs?.name ?? "",
      Status: a?.status ?? "not marked",
      "Check In": a?.check_in ? new Date(a.check_in).toLocaleTimeString("en-IN") : "",
      "Check Out": a?.check_out ? new Date(a.check_out).toLocaleTimeString("en-IN") : "",
    };
  });

  const monthRows = hubRiders.map((r) => {
    const m = monthQ.data?.[r.id] ?? { present: 0, absent: 0, late: 0, half_day: 0 };
    return {
      Rider: r.full_name, Code: r.rider_code ?? "", Hub: r.hubs?.name ?? "",
      Present: m.present, Late: m.late, "Half Day": m.half_day, Absent: m.absent,
      "Payable Days": m.present + m.late + m.half_day * 0.5,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Daily marking and monthly summary for all riders" />

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily Marking</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4 space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hub</Label>
                <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
                  <option value="">All hubs</option>
                  {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </div>
              <div className="flex items-end justify-end">
                <ExportButtons filename={`attendance-${date}`} rows={dayRows} title={`Attendance — ${date}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riders — {date}</CardTitle>
              <CardDescription>Tap a status to mark or change attendance</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || dayQ.isLoading ? <Skeleton className="h-40" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-2 py-2">Rider</th><th className="px-2 py-2">Hub</th>
                        <th className="px-2 py-2">Current</th><th className="px-2 py-2">Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubRiders.map((r) => {
                        const a = dayQ.data?.[r.id];
                        return (
                          <tr key={r.id} className="waybill-rule">
                            <td className="px-2 py-2.5">
                              <div className="font-medium">{r.full_name}</div>
                              <RiderChip code={r.rider_code} />
                            </td>
                            <td className="px-2 py-2.5">{r.hubs?.name ?? "—"}</td>
                            <td className="px-2 py-2.5">
                              {a ? <Badge variant={BADGE[a.status]}>{a.status.replace("_", " ")}</Badge> : <Badge variant="muted">not marked</Badge>}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => mark(r.id, s)}
                                    className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                                      a?.status === s
                                        ? "border-brand-500 bg-brand-500 text-white"
                                        : "border-[var(--border)] hover:border-brand-500/50"
                                    }`}
                                  >
                                    {s.replace("_", " ")}
                                  </button>
                                ))}
                              </div>
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
        </TabsContent>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Input type="month" max={todayISO().slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hub</Label>
                <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
                  <option value="">All hubs</option>
                  {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </div>
              <div className="flex items-end justify-end">
                <ExportButtons filename={`attendance-summary-${month}`} rows={monthRows} title={`Attendance Summary — ${month}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Summary — {month}</CardTitle>
              <CardDescription>Half days count as 0.5 payable days</CardDescription>
            </CardHeader>
            <CardContent>
              {monthQ.isLoading ? <Skeleton className="h-40" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-2 py-2">Rider</th>
                        <th className="px-2 py-2 text-center">Present</th>
                        <th className="px-2 py-2 text-center">Late</th>
                        <th className="px-2 py-2 text-center">Half Day</th>
                        <th className="px-2 py-2 text-center">Absent</th>
                        <th className="px-2 py-2 text-right">Payable Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubRiders.map((r) => {
                        const m = monthQ.data?.[r.id] ?? { present: 0, absent: 0, late: 0, half_day: 0 };
                        return (
                          <tr key={r.id} className="waybill-rule">
                            <td className="px-2 py-2.5">
                              <div className="font-medium">{r.full_name}</div>
                              <RiderChip code={r.rider_code} />
                            </td>
                            <td className="money px-2 py-2.5 text-center text-emerald-600 dark:text-emerald-400">{m.present}</td>
                            <td className="money px-2 py-2.5 text-center text-amber-600 dark:text-amber-400">{m.late}</td>
                            <td className="money px-2 py-2.5 text-center">{m.half_day}</td>
                            <td className="money px-2 py-2.5 text-center text-red-500">{m.absent}</td>
                            <td className="money px-2 py-2.5 text-right font-semibold">{m.present + m.late + m.half_day * 0.5}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
