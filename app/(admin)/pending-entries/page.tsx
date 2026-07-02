"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useRiders } from "@/lib/hooks";
import { todayISO } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ExportButtons } from "@/components/app/export-buttons";
import { RiderChip } from "@/components/app/rider-chip";
import { StatCard } from "@/components/app/stat-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function PendingEntriesPage() {
  const supabase = supabaseBrowser();
  const [date, setDate] = useState(todayISO());
  const [hubId, setHubId] = useState("");
  const [search, setSearch] = useState("");

  const { data: hubs } = useHubs();
  const { data: riders, isLoading } = useRiders({ activeOnly: true });

  const enteredQ = useQuery({
    queryKey: ["pending-entries", date],
    queryFn: async () => {
      const { data } = await supabase.from("data_entries").select("rider_id").eq("entry_date", date);
      return new Set((data ?? []).map((d) => d.rider_id));
    },
  });

  const rows = useMemo(() => {
    const entered = enteredQ.data ?? new Set<string>();
    return (riders ?? [])
      .filter((r) => (!hubId || r.hub_id === hubId))
      .filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return r.full_name.toLowerCase().includes(q) || (r.rider_code ?? "").toLowerCase().includes(q) || (r.phone ?? "").includes(q);
      })
      .map((r) => ({ rider: r, done: entered.has(r.id) }));
  }, [riders, enteredQ.data, hubId, search]);

  const pending = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);

  const exportRows = pending.map(({ rider }) => ({
    "Rider Code": rider.rider_code ?? "",
    "Rider Name": rider.full_name,
    Mobile: rider.phone ?? "",
    Hub: rider.hubs?.name ?? "",
    Date: date,
    Status: "PENDING",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending Data Entry"
        description="Active riders whose numbers haven't been recorded for the selected date"
        actions={<ExportButtons filename={`pending-entries-${date}`} rows={exportRows} title={`Pending Data Entry — ${date}`} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active Riders" value={String(rows.length)} icon={CheckCircle2} />
        <StatCard title="Entered" value={String(done.length)} icon={CheckCircle2} tone="teal" />
        <StatCard title="Pending" value={String(pending.length)} icon={AlertTriangle} tone={pending.length ? "warn" : "teal"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
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
          <div className="space-y-1.5">
            <Label>Search</Label>
            <Input placeholder="Name, code or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rider Status — {date}</CardTitle>
          <CardDescription>Pending riders are highlighted in red. Click a pending rider to jump to data entry.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || enteredQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-2">Rider</th>
                    <th className="px-2 py-2">Mobile</th>
                    <th className="px-2 py-2">Hub</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pending, ...done].map(({ rider, done: isDone }) => (
                    <tr key={rider.id} className={isDone ? "waybill-rule" : "waybill-rule bg-red-500/8"}>
                      <td className="px-2 py-2.5">
                        <div className={isDone ? "font-medium" : "font-semibold text-red-600 dark:text-red-400"}>{rider.full_name}</div>
                        <RiderChip code={rider.rider_code} />
                      </td>
                      <td className="money px-2 py-2.5">{rider.phone ?? "—"}</td>
                      <td className="px-2 py-2.5">{rider.hubs?.name ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        {isDone ? <Badge variant="success">Entered</Badge> : <Badge variant="danger">Pending</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {!isDone && (
                          <Link href="/data-entry" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                            Enter now →
                          </Link>
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
    </div>
  );
}
